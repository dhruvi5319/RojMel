import { isOwner, requireBackOffice } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { getT } from '@/lib/i18n/server'
import { formatDate, money, monthEnd, monthStart, todayIST } from '@/lib/format'
import type {
  CngState, CngSupply, CngSupplyCost, FuelType, LastTax, SalesByFuel, Staff,
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
 * CNG has no tank and no dip, so it does not belong on the Stock page. It
 * arrives on its own truck, weighed in kilograms — the same unit the
 * dispensers sell in. So the only stock control it has is arithmetic: what
 * the trucks brought, less what the dispensers sold.
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

  const [fuelsRes, dispensersRes, supplyRes, salesRes, staffRes, lastTaxRes] =
    await Promise.all([
    supabase.from('fuel_types').select('*').eq('unit', 'kg').order('sort_order'),
    supabase.from('v_cng_state').select('*').order('sort_order'),
    supabase
      .from('cng_supply')
      .select('*, cng_supply_costs(*)')
      .gte('supply_date', from)
      .lte('supply_date', to)
      .order('supply_date', { ascending: false }),
    supabase.rpc('sales_by_fuel', { p_from: from, p_to: to }),
    supabase.from('staff').select('*').eq('is_active', true).order('name'),
    supabase.from('v_last_purchase_tax').select('*'),
  ])

  const fuels = (fuelsRes.data ?? []) as FuelType[]
  const dispensers = (dispensersRes.data ?? []) as CngState[]
  const supply = (supplyRes.data ?? []) as unknown as SupplyRow[]
  const byFuel = (salesRes.data ?? []) as SalesByFuel[]
  const staff = (staffRes.data ?? []) as Staff[]
  // What was typed last time, as a hint. Rates move, so nothing is filled in.
  const lastGas = ((lastTaxRes.data ?? []) as LastTax[]).find(
    (x) => x.fuel_type_id === fuels[0]?.id,
  )

  const cng = byFuel.find((f) => f.unit === 'kg')
  const kgSold = Number(cng?.quantity ?? 0)
  const salesValue = Number(cng?.sales_value ?? 0)
  const kgIn = supply.reduce((s, r) => s + Number(r.kg_received), 0)
  const gasCost = supply.reduce(
    (s, r) => s + Number(r.cng_supply_costs?.amount ?? 0),
    0,
  )

  // Both sides are kilograms, so this is a real figure and not a conversion.
  const leftToSell = kgIn - kgSold

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
          label={t('cng.kgReceived')}
          value={`${kgIn.toFixed(2)} kg`}
          hint={t('cng.broughtIn')}
        />
        <Stat
          label={t('cng.stillToSell')}
          value={kgIn > 0 ? `${leftToSell.toFixed(2)} kg` : '—'}
          hint={t('cng.stillToSellHint')}
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
          <SupplyForm
            today={today}
            canSeeCost={owner}
            staff={staff}
            lastVat={lastGas?.vat_rate}
            lastCess={lastGas?.cess_rate}
          />
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
                  <Th>{t('stock.tanker')}</Th>
                  <Th className="text-right">{t('cng.challanKg')}</Th>
                  <Th className="text-right">{t('cng.kgReceived')}</Th>
                  <Th>{t('inv.number')}</Th>
                  {owner ? (
                    <>
                      <Th className="text-right">{t('cng.ratePerKg')}</Th>
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
                      <Td className="tabular">{r.tanker_number ?? '—'}</Td>
                      <Td className="tabular text-right text-neutral-600">
                        {r.invoice_kg != null ? Number(r.invoice_kg).toFixed(3) : '—'}
                      </Td>
                      <Td className="tabular text-right font-semibold">
                        {Number(r.kg_received).toFixed(3)}
                        {r.invoice_kg != null &&
                        Number(r.kg_received) - Number(r.invoice_kg) < -0.5 ? (
                          <div className="mt-1">
                            <Badge tone="danger">
                              {t('stock.shortDelivery')}{' '}
                              {(Number(r.invoice_kg) - Number(r.kg_received)).toFixed(2)} kg
                            </Badge>
                          </div>
                        ) : null}
                      </Td>
                      <Td className="tabular text-neutral-600">
                        {r.invoice_number ?? '—'}
                      </Td>
                      {owner ? (
                        <>
                          <Td className="tabular text-right">
                            {cost ? Number(cost.rate_per_kg).toFixed(3) : '—'}
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
