import { isOwner, requireBackOffice } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { getT } from '@/lib/i18n/server'
import { formatDate, litres, money, todayIST } from '@/lib/format'
import type {
  FuelPurchase, FuelPurchaseCost, Staff, Tank, TankStock,
} from '@/lib/database.types'
import {
  Alert, Badge, Card, CardHeader, Empty, PageHeader, TableWrap, Td, Th,
} from '@/components/ui'
import { DeleteButton } from '@/components/DeleteButton'
import { EditableRow } from '@/components/EditableRow'
import { EditDeliveryForm } from './EditDeliveryForm'
import { Collapsible } from '@/components/Collapsible'
import { DeliveryForm, DipForm } from './StockForms'
import { deleteDelivery } from './actions'

export const dynamic = 'force-dynamic'

interface DeliveryRow extends FuelPurchase {
  tanks: { name: string } | null
  staff: { name: string } | null
  /** one-to-one embed: an object, or null when RLS hides it */
  fuel_purchase_costs: FuelPurchaseCost | null
}

export default async function StockPage() {
  const session = await requireBackOffice()
  const owner = isOwner(session)
  const t = await getT()
  const supabase = await createClient()
  const today = todayIST()

  const [stockRes, tanksRes, staffRes, deliveriesRes] = await Promise.all([
    supabase.from('v_tank_stock').select('*').order('name'),
    supabase.from('tanks').select('*').eq('is_active', true).order('name'),
    supabase.from('staff').select('*').eq('is_active', true).order('name'),
    supabase
      .from('fuel_purchases')
      .select('*, tanks(name), staff(name), fuel_purchase_costs(*)')
      .order('delivery_date', { ascending: false })
      .limit(60),
  ])

  const stock = (stockRes.data ?? []) as TankStock[]
  const tanks = (tanksRes.data ?? []) as Tank[]
  const staff = (staffRes.data ?? []) as Staff[]
  const deliveries = (deliveriesRes.data ?? []) as unknown as DeliveryRow[]

  return (
    <>
      <PageHeader title={t('stock.title')} />

      {tanks.length === 0 ? (
        <Alert tone="accent">
          No tanks configured yet. Add them under {t('nav.settings')}.
        </Alert>
      ) : null}

      {/* ---------------------------------------------------- tank cards -- */}
      <div className="grid gap-4 sm:grid-cols-2">
        {stock.map((tk) => {
          const pct = tk.capacity_litres
            ? Math.max(0, Math.min(100, (tk.book_stock_litres / tk.capacity_litres) * 100))
            : 0
          const variance = tk.last_dip_variance
          return (
            <Card key={tk.tank_id} className="p-4">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <div className="font-semibold">{tk.name}</div>
                  <Badge tone="brand">{tk.fuel_name}</Badge>
                </div>
                <div className="text-right">
                  <div className="tabular text-xl font-semibold">
                    {litres(tk.book_stock_litres)}
                  </div>
                  <div className="text-sm text-muted">
                    {t('stock.capacity')}: {litres(tk.capacity_litres)}
                  </div>
                </div>
              </div>

              <div
                className="h-3 w-full overflow-hidden rounded-full bg-surface-2"
                role="img"
                aria-label={`${pct.toFixed(0)} percent full`}
              >
                <div
                  className={`h-full rounded-full ${pct < 20 ? 'bg-danger' : 'bg-brand'}`}
                  style={{ width: `${pct}%` }}
                />
              </div>

              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-muted">{t('stock.delivery')}</dt>
                  <dd className="tabular font-medium">{litres(tk.litres_received)}</dd>
                </div>
                <div>
                  <dt className="text-muted">{t('rep.sales')}</dt>
                  <dd className="tabular font-medium">{litres(tk.litres_sold)}</dd>
                </div>
                <div>
                  <dt className="text-muted">{t('stock.dip')}</dt>
                  <dd className="tabular font-medium">
                    {tk.last_dip_litres != null ? litres(tk.last_dip_litres) : '—'}
                    {tk.last_dip_date ? (
                      <span className="ml-1 text-muted">
                        ({formatDate(tk.last_dip_date)})
                      </span>
                    ) : null}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">{t('stock.variance')}</dt>
                  <dd
                    className={`tabular font-medium ${
                      variance == null
                        ? ''
                        : Math.abs(variance) > 50
                          ? 'text-danger'
                          : 'text-ok'
                    }`}
                  >
                    {variance == null
                      ? '—'
                      : `${variance > 0 ? '+' : ''}${litres(variance)}`}
                  </dd>
                </div>
              </dl>
            </Card>
          )
        })}
      </div>

      {tanks.length > 0 ? (
        <div className="mt-5 flex flex-col gap-3">
          <Collapsible title={t('stock.newDelivery')}>
            <DeliveryForm
              tanks={tanks}
              staff={staff}
              today={today}
              canSeeCost={owner}
            />
          </Collapsible>
          <Collapsible title={t('stock.recordDip')}>
            <DipForm tanks={tanks} today={today} />
          </Collapsible>
        </div>
      ) : null}

      {/* ---------------------------------------------------- deliveries -- */}
      <div className="mt-6">
        <Card>
          <CardHeader
            title={t('stock.delivery')}
            subtitle={owner ? undefined : t('stock.ownerOnlyCost')}
          />
          {deliveries.length === 0 ? (
            <Empty>{t('common.none')}</Empty>
          ) : (
            <TableWrap>
              <thead>
                <tr>
                  <Th>{t('common.date')}</Th>
                  <Th>{t('stock.tank')}</Th>
                  <Th>{t('stock.tanker')}</Th>
                  <Th className="text-right">{t('common.litres')}</Th>
                  {owner ? (
                    <>
                      <Th className="text-right">{t('stock.purchaseRate')}</Th>
                      <Th className="text-right">{t('common.amount')}</Th>
                    </>
                  ) : null}
                  <Th />
                </tr>
              </thead>
              <tbody>
                {deliveries.map((d) => {
                  const cost = d.fuel_purchase_costs
                  return (
                    <EditableRow
                      key={d.id}
                      span={owner ? 6 : 4}
                      label="Edit delivery"
                      cells={<>
                      <Td className="whitespace-nowrap">{formatDate(d.delivery_date)}</Td>
                      <Td className="font-medium">{d.tanks?.name ?? '—'}</Td>
                      <Td className="tabular">
                        {d.tanker_number ?? '—'}
                        {d.staff?.name ? (
                          <div className="text-sm text-muted">{d.staff.name}</div>
                        ) : null}
                      </Td>
                      <Td className="tabular text-right font-semibold">
                        {litres(d.litres)}
                      </Td>
                      {owner ? (
                        <>
                          <Td className="tabular text-right">
                            {cost ? Number(cost.rate_per_litre).toFixed(3) : '—'}
                          </Td>
                          <Td className="tabular text-right">
                            {cost ? money(cost.amount) : '—'}
                          </Td>
                        </>
                      ) : null}
                      </>}
                      actions={
                        <DeleteButton
                          action={deleteDelivery}
                          fields={{ id: d.id }}
                          label="Delete delivery"
                        />
                      }
                      form={
                        <EditDeliveryForm
                          delivery={d}
                          cost={cost ?? null}
                          canSeeCost={owner}
                        />
                      }
                    />
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
