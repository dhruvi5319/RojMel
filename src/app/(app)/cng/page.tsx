import { isOwner, requireBackOffice } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { getT } from '@/lib/i18n/server'
import { formatDate, money, monthEnd, monthStart, todayIST } from '@/lib/format'
import type {
  CngState, CngSupply, CngSupplyCost, FuelType, SalesByFuel,
} from '@/lib/database.types'
import {
  Alert, Badge, Card, CardHeader, Empty, PageHeader, Stat, TableWrap, Td, Th, rowClass,
} from '@/components/ui'
import { Collapsible } from '@/components/Collapsible'
import { DeleteButton } from '@/components/DeleteButton'
import { MonthPicker } from '@/components/MonthPicker'
import { DispenserForm, SupplyForm } from './CngForms'
import { deleteSupply } from './actions'

export const dynamic = 'force-dynamic'

interface SupplyRow extends CngSupply {
  /** one-to-one embed: an object, or null when RLS hides it from a manager */
  cng_supply_costs: CngSupplyCost | null
}

/**
 * CNG has no tank and no dip, so it does not belong on the Stock page. What it
 * has instead is an inlet meter: Gujarat Gas bills standard cubic metres in,
 * and the dispensers sell kilograms out. The gap between the two is compression
 * and line loss, and watching it is the only stock control CNG has.
 */
export default async function CngPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>
}) {
  const session = await requireBackOffice()
  const owner = isOwner(session)
  const t = await getT()
  const supabase = await createClient()
  const today = todayIST()
  const month = (await searchParams).month || today.slice(0, 7)
  const from = monthStart(`${month}-01`)
  const to = monthEnd(`${month}-01`)

  const [fuelsRes, dispensersRes, supplyRes, salesRes] = await Promise.all([
    supabase.from('fuel_types').select('*').eq('unit', 'kg').order('sort_order'),
    supabase.from('v_cng_state').select('*').order('sort_order'),
    supabase
      .from('cng_supply')
      .select('*, cng_supply_costs(*)')
      .gte('supply_date', from)
      .lte('supply_date', to)
      .order('supply_date', { ascending: false }),
    supabase.rpc('sales_by_fuel', { p_from: from, p_to: to }),
  ])

  const fuels = (fuelsRes.data ?? []) as FuelType[]
  const dispensers = (dispensersRes.data ?? []) as CngState[]
  const supply = (supplyRes.data ?? []) as unknown as SupplyRow[]
  const byFuel = (salesRes.data ?? []) as SalesByFuel[]

  const cng = byFuel.find((f) => f.unit === 'kg')
  const kgSold = Number(cng?.quantity ?? 0)
  const salesValue = Number(cng?.sales_value ?? 0)
  const scmIn = supply.reduce((s, r) => s + Number(r.scm_received), 0)
  const gasCost = supply.reduce(
    (s, r) => s + Number(r.cng_supply_costs?.amount ?? 0),
    0,
  )

  // Gas composition varies, so the honest figure is the one the pump actually
  // achieved rather than a textbook conversion factor.
  const kgPerScm = scmIn > 0 ? kgSold / scmIn : null

  if (fuels.length === 0) {
    return (
      <>
        <PageHeader title="CNG" />
        <Alert tone="accent">{t('cng.notSetUp')}</Alert>
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="CNG"
        subtitle={t('cng.subtitle')}
        action={<MonthPicker month={month} />}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label={t('cng.kgSold')}
          value={`${kgSold.toFixed(2)} kg`}
          hint={cng?.avg_rate ? `₹${Number(cng.avg_rate).toFixed(2)} / kg` : undefined}
          tone="ok"
        />
        <Stat label={t('rep.salesValue')} value={money(salesValue)} />
        <Stat
          label={t('cng.scmReceived')}
          value={scmIn.toFixed(2)}
          hint={t('cng.fromGujaratGas')}
        />
        <Stat
          label={t('cng.kgPerScm')}
          value={kgPerScm != null ? kgPerScm.toFixed(3) : '—'}
          hint={t('cng.kgPerScmHint')}
        />
      </div>

      {owner && gasCost > 0 ? (
        <div className="mt-4">
          <Alert tone="accent">
            {t('cng.gasCost')}: <strong>{money(gasCost)}</strong> ·{' '}
            {t('rep.salesValue')}: <strong>{money(salesValue)}</strong> ·{' '}
            {t('rep.grossProfit')}: <strong>{money(salesValue - gasCost)}</strong>
          </Alert>
        </div>
      ) : null}

      <div className="mt-5 flex flex-col gap-3">
        <Collapsible title={t('cng.recordSupply')}>
          <SupplyForm today={today} canSeeCost={owner} />
        </Collapsible>
        <Collapsible title={t('cng.addDispenser')}>
          <DispenserForm fuels={fuels} />
        </Collapsible>
      </div>

      {/* ------------------------------------------------------ dispensers -- */}
      <div className="mt-6">
        <Card className="overflow-hidden pb-1">
          <CardHeader
            title={t('cng.dispensers')}
            subtitle={t('cng.dispensersHint')}
          />
          {dispensers.length === 0 ? (
            <Empty>{t('common.none')}</Empty>
          ) : (
            <TableWrap>
              <thead>
                <tr>
                  <Th>{t('common.name')}</Th>
                  <Th className="text-right">{t('set.currentRate')}</Th>
                  <Th className="text-right">{t('shift.closing')}</Th>
                  <Th>{t('cust.lastSale')}</Th>
                </tr>
              </thead>
              <tbody>
                {dispensers.map((d) => (
                  <tr key={d.dispenser_id} className={rowClass}>
                    <Td>
                      <span className="font-semibold">{d.name}</span>
                      <span className="ml-2">
                        <Badge tone="ok">{d.fuel_name}</Badge>
                      </span>
                    </Td>
                    <Td className="tabular text-right">
                      {d.sale_rate != null ? `₹${Number(d.sale_rate).toFixed(2)}` : '—'}
                    </Td>
                    <Td className="tabular text-right">
                      {Number(d.last_closing).toFixed(3)}
                    </Td>
                    <Td className="text-neutral-600">
                      {formatDate(d.last_reading_date)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
          <p className="px-5 py-4 text-[12.5px] text-neutral-600">
            {t('cng.readingsLiveOnShift')}
          </p>
        </Card>
      </div>

      {/* ---------------------------------------------------------- supply -- */}
      <div className="mt-6">
        <Card className="overflow-hidden pb-1">
          <CardHeader
            title={t('cng.supply')}
            subtitle={owner ? undefined : t('cng.ownerOnlyGas')}
          />
          {supply.length === 0 ? (
            <Empty>{t('common.none')}</Empty>
          ) : (
            <TableWrap>
              <thead>
                <tr>
                  <Th>{t('common.date')}</Th>
                  <Th className="text-right">{t('cng.scmReceived')}</Th>
                  <Th>{t('inv.number')}</Th>
                  {owner ? (
                    <>
                      <Th className="text-right">{t('cng.ratePerScm')}</Th>
                      <Th className="text-right">{t('common.amount')}</Th>
                    </>
                  ) : null}
                  <Th />
                </tr>
              </thead>
              <tbody>
                {supply.map((r) => {
                  const cost = r.cng_supply_costs
                  return (
                    <tr key={r.id} className={rowClass}>
                      <Td className="whitespace-nowrap">{formatDate(r.supply_date)}</Td>
                      <Td className="tabular text-right font-semibold">
                        {Number(r.scm_received).toFixed(3)}
                      </Td>
                      <Td className="tabular text-neutral-600">
                        {r.invoice_number ?? '—'}
                      </Td>
                      {owner ? (
                        <>
                          <Td className="tabular text-right">
                            {cost ? Number(cost.rate_per_scm).toFixed(3) : '—'}
                          </Td>
                          <Td className="tabular text-right">
                            {cost ? money(cost.amount) : '—'}
                          </Td>
                        </>
                      ) : null}
                      <Td className="text-right">
                        <DeleteButton
                          action={deleteSupply}
                          fields={{ id: r.id }}
                          label="Delete supply entry"
                        />
                      </Td>
                    </tr>
                  )
                })}
              </tbody>
            </TableWrap>
          )}
        </Card>
      </div>
    </>
  )
}
