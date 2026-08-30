import { requireBackOffice } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { getT } from '@/lib/i18n/server'
import { todayIST } from '@/lib/format'
import type {
  CustomerBalance, FuelType, NozzleState, Shift, Staff, Vehicle,
} from '@/lib/database.types'
import { Card, LinkButton, PageHeader } from '@/components/ui'
import { CreditSlipForm } from './CreditSlipForm'

export const dynamic = 'force-dynamic'

export default async function NewCreditSlipPage({
  searchParams,
}: {
  searchParams: Promise<{ customer?: string; date?: string }>
}) {
  await requireBackOffice()
  const sp = await searchParams
  const date = sp.date || todayIST()
  const t = await getT()
  const supabase = await createClient()

  const [customersRes, vehiclesRes, fuelsRes, nozzlesRes, shiftsRes, staffRes] =
    await Promise.all([
      supabase
        .from('v_customer_balances')
        .select('*')
        .eq('is_active', true)
        .order('name'),
      supabase.from('vehicles').select('*').eq('is_active', true).order('vehicle_number'),
      supabase.from('fuel_types').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('v_nozzle_state').select('*').order('sort_order'),
      supabase.from('shifts').select('*').eq('business_date', date).order('sort_order'),
      supabase.from('staff').select('*').eq('is_active', true).order('name'),
    ])

  return (
    <>
      <PageHeader
        title={t('credit.new')}
        action={
          <LinkButton href={`/credit?date=${date}`} variant="secondary" size="sm">
            {t('common.back')}
          </LinkButton>
        }
      />
      <Card className="p-5">
        <CreditSlipForm
          date={date}
          preselectedCustomer={sp.customer ?? ''}
          customers={(customersRes.data ?? []) as CustomerBalance[]}
          vehicles={(vehiclesRes.data ?? []) as Vehicle[]}
          fuels={(fuelsRes.data ?? []) as FuelType[]}
          nozzles={(nozzlesRes.data ?? []) as NozzleState[]}
          shifts={(shiftsRes.data ?? []) as Shift[]}
          staff={(staffRes.data ?? []) as Staff[]}
        />
      </Card>
    </>
  )
}
