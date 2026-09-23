import { requireSession } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { businessDateAt, shiftAt } from '@/lib/shifts'
import type {
  CreditSale, FuelType, NozzleState, Shift, ShiftCashDenomination, ShiftCollection,
  ShiftFiller,
  ShiftMeter, Staff, Vehicle,
} from '@/lib/database.types'
import { CounterApp, type CounterCustomer, type ShiftDigest } from './CounterApp'

export const dynamic = 'force-dynamic'

/** The working day before this one — the far edge of what the counter may see. */
function dayBefore(date: string): string {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

const total = (rows: { amount: number }[] | null, id: string) =>
  (rows ?? []).reduce(
    (t, r) => t + ((r as { shift_id?: string }).shift_id === id ? Number(r.amount) : 0),
    0,
  )

export default async function CounterPage({
  searchParams,
}: {
  searchParams: Promise<{ shift?: string; view?: string }>
}) {
  const { station, profile } = await requireSession()
  const supabase = await createClient()

  /*
   * The clock has two jobs and starting a shift is not one of them: it says
   * which shift is due, so the start sheet can offer it first, and it stamps
   * the working day, which rolls when the day shift takes over rather than at
   * midnight. A shift exists because somebody pressed start.
   */
  const now = new Date()
  const suggested = shiftAt(now, station)
  const today = businessDateAt(now, station)
  const yesterday = dayBefore(today)
  const asked = await searchParams
  const wanted = asked.shift
  // Moving the device onto another shift is a navigation, which remounts the
  // screen and forgets which one was open — so where to land travels with it.
  const opening = asked.view === 'meters' ? 'meters' : 'home'

  const [staffRes, nozzlesRes, fuelsRes, customersRes, vehiclesRes, shiftsRes] =
    await Promise.all([
      // No PIN: the device is shared, and a PIN sent to the browser to be
      // compared there is not a lock on anything.
      supabase
        .from('staff')
        .select('id, name, name_gu, default_shift, rotates, rotation_role, rotation_set_on')
        .eq('is_active', true)
        .order('name'),
      supabase.from('v_nozzle_state').select('*').order('sort_order'),
      supabase.from('fuel_types').select('*').eq('is_active', true).order('sort_order'),
      // The counter's RLS returns nothing from the balances view, so it falls
      // back to plain customer rows and simply shows no money.
      supabase.from('customers').select('id, name').eq('is_active', true).order('name'),
      supabase.from('vehicles').select('*').eq('is_active', true).order('vehicle_number'),
      supabase
        .from('shifts')
        .select('*')
        .in('business_date', [yesterday, today])
        .order('business_date')
        .order('sort_order'),
    ])

  const shifts = (shiftsRes.data ?? []) as Shift[]
  const ids = shifts.map((s) => s.id)

  // Enough of every shift in reach to fill the picker: what went out, what of
  // it was on udhaar, and who worked it.
  const [readRes, cngRes, slipsRes, fillersRes] = ids.length
    ? await Promise.all([
        supabase.from('nozzle_readings').select('shift_id, amount').in('shift_id', ids),
        supabase.from('cng_readings').select('shift_id, amount').in('shift_id', ids),
        supabase
          .from('credit_sales')
          .select('*')
          .in('shift_id', ids)
          .order('created_at', { ascending: false }),
        supabase.from('v_shift_fillers').select('*').in('shift_id', ids).order('name'),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }]

  const reads = (readRes.data ?? []) as { shift_id: string; amount: number }[]
  const cng = (cngRes.data ?? []) as { shift_id: string; amount: number }[]
  const slips = (slipsRes.data ?? []) as CreditSale[]
  const fillers = (fillersRes.data ?? []) as ShiftFiller[]

  const digests: ShiftDigest[] = shifts.map((s) => ({
    ...s,
    sold: total(reads, s.id) + total(cng, s.id),
    udhaar: slips.reduce(
      (t, slip) => t + (slip.shift_id === s.id ? Number(slip.amount) : 0),
      0,
    ),
    fillers: fillers.filter((f) => f.shift_id === s.id),
  }))

  /*
   * The shift the device is on. Whichever one was asked for, else the shift
   * that is running — the later of them, so starting the night early moves
   * the whole screen onto it. If nothing is open the device is resting, and
   * says so rather than guessing from the clock.
   */
  const open = digests.filter((s) => s.status === 'open')
  const current =
    digests.find((s) => s.id === wanted) ??
    open.filter((s) => s.business_date === today).pop() ??
    open.pop() ??
    null

  const [metersRes, collectionsRes, denominationsRes, shiftMoneyRes] = current
    ? await Promise.all([
        // In the order somebody walks the forecourt: the pumps, then the
        // CNG island. ('nozzle' sorts after 'cng', hence descending.) Only
        // this shift's own readings — closing one shift never means reading
        // another's, and the shift it inherited from is not this screen's.
        supabase
          .from('v_shift_meters')
          .select('*')
          .eq('shift_id', current.id)
          .order('kind', { ascending: false })
          .order('sort_order'),
        supabase
          .from('shift_collections')
          .select('*')
          .eq('shift_id', current.id)
          .not('staff_id', 'is', null),
        supabase
          .from('shift_cash_denominations')
          .select('*')
          .eq('shift_id', current.id),
        // The card machine and the UPI QR are shared, so this is the shift's
        // own row — the one with no filler against it — not a per-person one.
        supabase
          .from('shift_collections')
          .select('card_amount, upi_amount, bpcl_amount')
          .eq('shift_id', current.id)
          .is('staff_id', null)
          .maybeSingle(),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }, { data: null }]

  const collections = (collectionsRes.data ?? []) as ShiftCollection[]
  const denominations = (denominationsRes.data ?? []) as ShiftCashDenomination[]
  const meters = (metersRes.data ?? []) as ShiftMeter[]
  const shiftMoney = (shiftMoneyRes.data ?? null) as {
    card_amount: number
    upi_amount: number
    bpcl_amount: number
  } | null

  // What the filler needs at handover: what the meters say went out, what of
  // it went on udhaar and what settled by card, UPI or the BPCL card — all of
  // it money that never reaches the cash box — so what is left is what cash
  // is actually owed, and what has been counted against it.
  const sold = current?.sold ?? 0
  const udhaar = current?.udhaar ?? 0
  const card = Number(shiftMoney?.card_amount ?? 0)
  const upi = Number(shiftMoney?.upi_amount ?? 0)
  const bpcl = Number(shiftMoney?.bpcl_amount ?? 0)

  return (
    <CounterApp
      stationName={station.name}
      role={profile.role}
      today={today}
      suggested={{ name: suggested.name, order: suggested.order }}
      hours={{
        day_starts_at: station.day_starts_at,
        night_starts_at: station.night_starts_at,
      }}
      staff={(staffRes.data ?? []) as Staff[]}
      nozzles={(nozzlesRes.data ?? []) as NozzleState[]}
      fuels={(fuelsRes.data ?? []) as FuelType[]}
      customers={(customersRes.data ?? []) as CounterCustomer[]}
      vehicles={(vehiclesRes.data ?? []) as Vehicle[]}
      shifts={digests}
      shift={current}
      meters={meters}
      now={now.toISOString()}
      opening={opening}
      fillers={current ? fillers.filter((f) => f.shift_id === current.id) : []}
      slips={current ? slips.filter((s) => s.shift_id === current.id) : []}
      collections={collections}
      denominations={denominations}
      shiftMoney={{ card, upi, bpcl }}
      hissab={{
        sold,
        udhaar,
        // sold = cash + ATM + UPI + BPCL + udhaar — the same equation the
        // money log settles with, not just meter sales less udhaar.
        cash: sold - udhaar - card - upi - bpcl,
        counted: collections.reduce((t, c) => t + Number(c.cash_amount), 0),
      }}
    />
  )
}
