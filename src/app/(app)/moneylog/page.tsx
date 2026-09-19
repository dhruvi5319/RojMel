import Link from 'next/link'
import { CircleCheckBig, TriangleAlert } from 'lucide-react'
import { requireBackOffice , pumpToday } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { getLang, getT } from '@/lib/i18n/server'
import {formatDateLong, money, quantity} from '@/lib/format'
import { shiftLabel } from '@/lib/shifts'
import type { ShiftFuelSale, ShiftMoney } from '@/lib/database.types'
import {
  Alert, Badge, Card, CardHeader, Empty, Kicker, LinkButton, PageHeader,
  TableWrap, Td, Th,
} from '@/components/ui'
import { MoneyForm } from './MoneyForm'
import { VarianceForm } from './VarianceForm'

export const dynamic = 'force-dynamic'

/**
 * The page that replaces the book.
 *
 * For each shift: what the meters say left the pump, fuel by fuel, priced at
 * that day's rate — and against it, the five ways money arrives. The two
 * totals must meet. Where they do not, the difference belongs to that shift,
 * because that is the shift whose filler has to explain it.
 */
export default async function MoneyLogPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  const session = await requireBackOffice()
  const t = await getT()
  const lang = await getLang()
  const supabase = await createClient()
  const date = (await searchParams).date || pumpToday(session)

  const [moneyRes, fuelRes, byFillerRes, loose] = await Promise.all([
    supabase.from('v_shift_money').select('*').eq('business_date', date).order('sort_order'),
    supabase
      .from('v_shift_fuel_sales')
      .select('*')
      .eq('business_date', date)
      .order('sort_order'),
    // Whatever named fillers handed over on the shift screen; the money log
    // writes the shift's own row and must not claim theirs.
    supabase
      .from('shift_collections')
      .select('shift_id, staff_id, cash_amount, card_amount, upi_amount, bpcl_amount')
      .not('staff_id', 'is', null),
    supabase
      .from('v_unattached_udhaar')
      .select('*')
      .eq('business_date', date)
      .maybeSingle<{ slips: number; amount: number }>(),
  ])

  const shifts = (moneyRes.data ?? []) as ShiftMoney[]
  const fillerRows = (byFillerRes.data ?? []) as {
    shift_id: string
    cash_amount: number
    card_amount: number
    upi_amount: number
    bpcl_amount: number
  }[]
  const fuels = (fuelRes.data ?? []) as ShiftFuelSale[]

  const fuelName = (f: ShiftFuelSale) =>
    lang === 'gu' && f.fuel_name_gu ? f.fuel_name_gu : f.fuel_name

  const day = shifts.reduce(
    (a, s) => ({
      sale: a.sale + Number(s.total_sale),
      cash: a.cash + Number(s.cash),
      card: a.card + Number(s.card),
      upi: a.upi + Number(s.upi),
      bpcl: a.bpcl + Number(s.bpcl),
      udhaar: a.udhaar + Number(s.udhaar),
      accounted: a.accounted + Number(s.accounted),
      difference: a.difference + Number(s.difference),
    }),
    { sale: 0, cash: 0, card: 0, upi: 0, bpcl: 0, udhaar: 0, accounted: 0, difference: 0 },
  )

  return (
    <>
      <PageHeader title={t('money.title')} subtitle={formatDateLong(date)} />
      <p className="mb-5 max-w-2xl text-[13px] text-neutral-600">
        {t('money.subtitle')}
      </p>

      {loose.data ? (
        <div className="mb-5">
          <Alert tone="danger">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>
                <strong>{t('money.looseUdhaar')}</strong> — {loose.data.slips}{' '}
                {t('credit.title').toLowerCase()},{' '}
                <span className="tabular">{money(loose.data.amount)}</span>.{' '}
                {t('money.looseUdhaarWhy')}
              </span>
              <Link href={`/credit?date=${date}`} className="font-semibold underline">
                {t('credit.title')} →
              </Link>
            </div>
          </Alert>
        </div>
      ) : null}

      {shifts.length === 0 ? (
        <Card>
          <Empty>
            {t('money.noShifts')}
            <div className="mt-3">
              <LinkButton href={`/shifts?date=${date}`} size="sm">
                {t('shift.new')}
              </LinkButton>
            </div>
          </Empty>
        </Card>
      ) : (
        <div className="flex flex-col gap-5">
          {shifts.map((s) => {
            const mine = fuels.filter((f) => f.shift_id === s.shift_id)
            const byFiller = fillerRows
              .filter((r) => r.shift_id === s.shift_id)
              .reduce(
                (a, r) =>
                  a + Number(r.cash_amount) + Number(r.card_amount) +
                  Number(r.upi_amount) + Number(r.bpcl_amount),
                0,
              )
            // what the money log itself is responsible for
            const own = {
              cash: Number(s.cash) - fillerRows.filter((r) => r.shift_id === s.shift_id)
                .reduce((a, r) => a + Number(r.cash_amount), 0),
              card: Number(s.card) - fillerRows.filter((r) => r.shift_id === s.shift_id)
                .reduce((a, r) => a + Number(r.card_amount), 0),
              upi: Number(s.upi) - fillerRows.filter((r) => r.shift_id === s.shift_id)
                .reduce((a, r) => a + Number(r.upi_amount), 0),
              bpcl: Number(s.bpcl) - fillerRows.filter((r) => r.shift_id === s.shift_id)
                .reduce((a, r) => a + Number(r.bpcl_amount), 0),
            }
            const diff = Number(s.difference)
            const settled = Math.abs(diff) < 0.5
            const recorded = s.variance_amount != null

            return (
              <Card key={s.shift_id}>
                <CardHeader
                  title={shiftLabel(t, s.name)}
                  subtitle={`${quantity(s.litres_sold)}${
                    Number(s.kg_sold) > 0 ? ` · ${quantity(s.kg_sold, 'kg')}` : ''
                  }`}
                  action={
                    <Badge tone={settled ? 'ok' : 'danger'}>
                      {settled
                        ? t('money.balances')
                        : `${diff > 0 ? t('money.short') : t('money.over')} ${money(Math.abs(diff))}`}
                    </Badge>
                  }
                />

                <div className="grid gap-5 p-5 pt-0 lg:grid-cols-2">
                  {/* ─────────────────────────── what the meters say sold ── */}
                  <div>
                    <div className="mb-2">
                      <Kicker>{t('money.whatSold')}</Kicker>
                    </div>
                    <div className="rounded-[18px] border border-divider">
                      <TableWrap>
                        <thead>
                          <tr>
                            <Th>{t('common.fuel')}</Th>
                            <Th className="text-right">{t('common.quantity')}</Th>
                            <Th className="text-right">{t('common.rate')}</Th>
                            <Th className="text-right">{t('common.amount')}</Th>
                          </tr>
                        </thead>
                        <tbody>
                          {mine.map((f) => (
                            <tr key={f.fuel_type_id}>
                              <Td>
                                <span className="font-medium">{fuelName(f)}</span>
                                <div className="tabular text-[12px] text-neutral-600">
                                  {t('money.opening')} →{' '}
                                  {t('money.closing').toLowerCase()} ·{' '}
                                  {f.meters} {f.meters === 1 ? 'meter' : 'meters'}
                                  {Number(f.test_quantity) > 0
                                    ? ` · ${t('shift.testing').toLowerCase()} ${f.test_quantity}`
                                    : ''}
                                </div>
                              </Td>
                              <Td className="tabular text-right">
                                {quantity(f.quantity, f.unit)}
                              </Td>
                              <Td className="tabular text-right">
                                ₹{Number(f.sale_rate).toFixed(2)}
                                {f.rates_differ ? (
                                  <div className="text-[11px] text-danger">
                                    {t('money.ratesDiffer')}
                                  </div>
                                ) : null}
                              </Td>
                              <Td className="tabular text-right font-semibold">
                                {money(f.amount)}
                              </Td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="bg-neutral-200 font-semibold">
                            <Td colSpan={3}>{t('money.sold')}</Td>
                            <Td className="tabular text-right">{money(s.total_sale)}</Td>
                          </tr>
                        </tfoot>
                      </TableWrap>
                    </div>
                  </div>

                  {/* ──────────────────────────── how the money arrived ──── */}
                  <div>
                    <div className="mb-2">
                      <Kicker>{t('money.howMoneyCame')}</Kicker>
                    </div>
                    <div className="rounded-[18px] border border-divider">
                      <TableWrap>
                        <tbody>
                          <Mode label={t('mode.cash')} value={s.cash} />
                          <Mode label={t('mode.card')} value={s.card} />
                          <Mode label={t('mode.upi')} value={s.upi} />
                          <Mode label={t('mode.bpcl_card')} value={s.bpcl} />
                          <Mode label={t('mode.udhaar')} value={s.udhaar} />
                        </tbody>
                        <tfoot>
                          <tr className="bg-neutral-200 font-semibold">
                            <Td>{t('money.accounted')}</Td>
                            <Td className="tabular text-right">{money(s.accounted)}</Td>
                          </tr>
                          <tr
                            className={
                              settled ? 'bg-accent-2-100' : 'bg-danger-100 font-semibold'
                            }
                          >
                            <Td>
                              <span className="inline-flex items-center gap-2">
                                {settled ? (
                                  <CircleCheckBig
                                    className="size-4 text-accent-2-700"
                                    aria-hidden
                                  />
                                ) : (
                                  <TriangleAlert className="size-4 text-danger" aria-hidden />
                                )}
                                {t('money.difference')}
                              </span>
                            </Td>
                            <Td
                              className={`tabular text-right ${settled ? '' : 'text-danger'}`}
                            >
                              {money(diff)}
                            </Td>
                          </tr>
                        </tfoot>
                      </TableWrap>
                    </div>
                  </div>
                </div>

                {/* ────────────────────────────── writing the money in ──── */}
                <div className="border-t border-divider p-5">
                  <Kicker>{t('money.step1')}</Kicker>
                  <p className="mt-2 mb-3 max-w-prose text-[12.5px] text-neutral-600">
                    {t('money.step1Hint')} {t('money.udhaarFromSlips')}
                  </p>
                  <MoneyForm
                    shiftId={s.shift_id}
                    cash={own.cash}
                    card={own.card}
                    upi={own.upi}
                    bpcl={own.bpcl}
                    udhaar={Number(s.udhaar)}
                    sold={Number(s.total_sale)}
                    byFiller={byFiller}
                  />
                </div>

                {/* ───────────────────────── the difference, written down ── */}
                <div className="border-t border-divider p-5">
                  <Kicker>{t('money.step2')}</Kicker>
                  <p className="mt-2 mb-3 max-w-prose text-[12.5px] text-neutral-600">
                    {t('money.step2Hint')}
                  </p>
                  <VarianceForm
                    shiftId={s.shift_id}
                    difference={diff}
                    note={s.variance_note}
                    recorded={recorded}
                    recordedAmount={s.variance_amount}
                  />
                </div>
              </Card>
            )
          })}

          {/* ───────────────────────────────────────────── the whole day ── */}
          {shifts.length > 1 ? (
            <Card>
              <CardHeader title={t('money.dayTotal')} />
              <TableWrap>
                <tbody>
                  <Mode label={t('money.sold')} value={day.sale} strong />
                  <Mode label={t('mode.cash')} value={day.cash} />
                  <Mode label={t('mode.card')} value={day.card} />
                  <Mode label={t('mode.upi')} value={day.upi} />
                  <Mode label={t('mode.bpcl_card')} value={day.bpcl} />
                  <Mode label={t('mode.udhaar')} value={day.udhaar} />
                  <Mode label={t('money.accounted')} value={day.accounted} strong />
                </tbody>
              </TableWrap>
              <div className="p-5 pt-3">
                {Math.abs(day.difference) < 0.5 ? (
                  <Alert tone="ok">{t('dash.allSquare')}</Alert>
                ) : (
                  <Alert tone="danger">
                    {t('money.difference')}: <strong>{money(day.difference)}</strong>
                  </Alert>
                )}
              </div>
            </Card>
          ) : null}
        </div>
      )}
    </>
  )
}

function Mode({
  label,
  value,
  strong,
}: {
  label: string
  value: number | string
  strong?: boolean
}) {
  return (
    <tr className={strong ? 'font-semibold' : undefined}>
      <Td>{label}</Td>
      <Td className="tabular text-right">{money(Number(value))}</Td>
    </tr>
  )
}
