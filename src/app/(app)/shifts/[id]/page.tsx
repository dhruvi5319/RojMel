import { notFound } from 'next/navigation'
import { requireBackOffice } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { getT } from '@/lib/i18n/server'
import { formatDateLong } from '@/lib/format'
import type {
  NozzleReading, NozzleState, Shift, ShiftCollection, Staff,
} from '@/lib/database.types'
import { Alert, LinkButton, PageHeader } from '@/components/ui'
import { ShiftEntry } from './ShiftEntry'

export const dynamic = 'force-dynamic'

export default async function ShiftPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireBackOffice()
  const { id } = await params
  const t = await getT()
  const supabase = await createClient()

  const { data: shift } = await supabase
    .from('shifts')
    .select('*')
    .eq('id', id)
    .maybeSingle<Shift>()

  if (!shift) notFound()

  const [nozzlesRes, readingsRes, staffRes, collectionsRes, closingRes, creditRes] =
    await Promise.all([
      supabase.from('v_nozzle_state').select('*').order('sort_order'),
      supabase.from('nozzle_readings').select('*').eq('shift_id', id),
      supabase.from('staff').select('*').eq('is_active', true).order('name'),
      supabase.from('shift_collections').select('*').eq('shift_id', id),
      supabase
        .from('day_closings')
        .select('status')
        .eq('business_date', shift.business_date)
        .maybeSingle<{ status: string }>(),
      // Credit slips are part of the meter total, so the handover expected
      // from the fillers is meter sales minus whatever went out on udhaar.
      supabase.from('credit_sales').select('amount').eq('shift_id', id),
    ])

  const creditTotal = (creditRes.data ?? []).reduce(
    (sum, row) => sum + Number((row as { amount: number }).amount),
    0,
  )

  const locked =
    shift.status === 'approved' || closingRes.data?.status === 'approved'

  return (
    <>
      <PageHeader
        title={`${shift.name} — ${t('shift.readings')}`}
        subtitle={formatDateLong(shift.business_date)}
        action={
          <LinkButton
            href={`/shifts?date=${shift.business_date}`}
            variant="secondary"
            size="sm"
          >
            {t('common.back')}
          </LinkButton>
        }
      />

      {locked ? (
        <div className="mb-4">
          <Alert tone="accent">{t('day.locked')}</Alert>
        </div>
      ) : null}

      <ShiftEntry
        shift={shift}
        locked={locked}
        nozzles={(nozzlesRes.data ?? []) as NozzleState[]}
        readings={(readingsRes.data ?? []) as NozzleReading[]}
        staff={(staffRes.data ?? []) as Staff[]}
        collections={(collectionsRes.data ?? []) as ShiftCollection[]}
        creditTotal={creditTotal}
      />
    </>
  )
}
