import { Fragment } from 'react'
import { isOwner, requireBackOffice } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { getT } from '@/lib/i18n/server'
import { formatDate, litres, money, todayIST } from '@/lib/format'
import type {
  Delivery, FuelPurchaseCost, LastTax, Shift, Staff, Tank, TankStock,
} from '@/lib/database.types'
import {
  Alert, Badge, Card, CardHeader, Empty, PageHeader, TableWrap, Td, Th, rowClass,
} from '@/components/ui'
import { DeleteButton } from '@/components/DeleteButton'
import { EditableRow } from '@/components/EditableRow'
import { EditDeliveryForm } from './EditDeliveryForm'
import { Collapsible } from '@/components/Collapsible'
import { DeliveryForm, DipForm } from './StockForms'
import { deleteDelivery } from './actions'

export const dynamic = 'force-dynamic'

interface DeliveryRow extends Delivery {
  /** one-to-one embed: an object, or null when RLS hides it */
  fuel_purchase_costs: FuelPurchaseCost | null
}

export default async function StockPage() {
  const session = await requireBackOffice()
  const owner = isOwner(session)
  const t = await getT()
  const supabase = await createClient()
  const today = todayIST()

  const [stockRes, tanksRes, staffRes, deliveriesRes, shiftsRes, lastTaxRes] =
    await Promise.all([
    supabase.from('v_tank_stock').select('*').order('name'),
    supabase.from('tanks').select('*').eq('is_active', true).order('name'),
    supabase.from('staff').select('*').eq('is_active', true).order('name'),
    supabase
      .from('v_deliveries')
      .select('*, fuel_purchase_costs(*)')
      .order('delivery_date', { ascending: false })
      .order('delivery_id')
      .order('tank_name')
      .limit(60),
    supabase
      .from('shifts')
      .select('*')
      .eq('business_date', today)
      .order('sort_order'),
    // Rates move, so the form says what was typed last time rather than
    // filling anything in. Returns no rows for a manager, which is correct.
    supabase.from('v_last_purchase_tax').select('*'),
  ])

  const stock = (stockRes.data ?? []) as TankStock[]
  const tanks = (tanksRes.data ?? []) as Tank[]
  const staff = (staffRes.data ?? []) as Staff[]
  const deliveries = (deliveriesRes.data ?? []) as unknown as DeliveryRow[]

  // One trip from the depot fills more than one tank, so the lines sit under
  // the tanker they came off rather than repeating it on every row.
  const visits: DeliveryRow[][] = []
  for (const d of deliveries) {
    const last = visits[visits.length - 1]
    if (last && last[0].delivery_id === d.delivery_id) last.push(d)
    else visits.push([d])
  }
  const shifts = (shiftsRes.data ?? []) as Shift[]
  const lastTax = (lastTaxRes.data ?? []) as LastTax[]

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
                  <Badge tone="accent">{tk.fuel_name}</Badge>
                </div>
                <div className="text-right">
                  <div className="tabular text-xl font-semibold">
                    {litres(tk.book_stock_litres)}
                  </div>
                  <div className="text-sm text-neutral-600">
                    {t('stock.capacity')}: {litres(tk.capacity_litres)}
                  </div>
                </div>
              </div>

              <div
                className="h-3 w-full overflow-hidden rounded-full bg-neutral-200"
                role="img"
                aria-label={`${pct.toFixed(0)} percent full`}
              >
                <div
                  className={`h-full rounded-full ${pct < 20 ? 'bg-danger' : 'bg-accent'}`}
                  style={{ width: `${pct}%` }}
                />
              </div>

              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-neutral-600">{t('stock.delivery')}</dt>
                  <dd className="tabular font-medium">{litres(tk.litres_received)}</dd>
                </div>
                <div>
                  <dt className="text-neutral-600">{t('rep.sales')}</dt>
                  <dd className="tabular font-medium">{litres(tk.litres_sold)}</dd>
                </div>
                <div>
                  <dt className="text-neutral-600">{t('stock.dip')}</dt>
                  <dd className="tabular font-medium">
                    {tk.last_dip_litres != null ? litres(tk.last_dip_litres) : '—'}
                    {tk.last_dip_date ? (
                      <span className="ml-1 text-neutral-600">
                        ({formatDate(tk.last_dip_date)})
                      </span>
                    ) : null}
                  </dd>
                </div>
                <div>
                  <dt className="text-neutral-600">{t('stock.variance')}</dt>
                  <dd
                    className={`tabular font-medium ${
                      variance == null
                        ? ''
                        : Math.abs(variance) > 50
                          ? 'text-danger'
                          : 'text-accent-2-700'
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
          {/* A delivery adds stock and comes with the depot's invoice, so the
              owner records it. The manager reads every one of them — she
              cannot check a day against stock she cannot see. */}
          {owner ? (
            <Collapsible title={t('stock.newDelivery')}>
              <DeliveryForm
                tanks={tanks}
                staff={staff}
                today={today}
                canSeeCost={owner}
                lastTax={lastTax}
              />
            </Collapsible>
          ) : (
            <Alert tone="accent">{t('stock.ownerOnlyDelivery')}</Alert>
          )}
          <Collapsible title={t('stock.recordDip')}>
            <DipForm tanks={tanks} today={today} shifts={shifts} />
          </Collapsible>
        </div>
      ) : null}

      {/* ---------------------------------------------------- deliveries -- */}
      <div className="mt-6">
        <Card>
          <CardHeader
            title={t('stock.delivery')}
            subtitle={owner ? t('stock.ownerReceives') : t('stock.ownerOnlyDelivery')}
          />
          {deliveries.length === 0 ? (
            <Empty>{t('common.none')}</Empty>
          ) : (
            <TableWrap>
              <thead>
                <tr>
                  <Th>{t('stock.tank')}</Th>
                  <Th>{t('common.fuel')}</Th>
                  <Th className="text-right">{t('stock.challan')}</Th>
                  <Th className="text-right">{t('stock.received')}</Th>
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
                {visits.map((lines) => {
                  const v = lines[0]
                  const total = lines.reduce((sum, l) => sum + Number(l.litres), 0)
                  return (
                    <Fragment key={v.delivery_id}>
                      {/* The tanker, said once for the tanks it filled. */}
                      <tr className="bg-neutral-200/60">
                        <td
                          colSpan={owner ? 6 : 4}
                          className="border-b border-divider px-4 py-2"
                        >
                          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                            <span className="font-semibold">
                              {formatDate(v.delivery_date)}
                            </span>
                            <span className="tabular font-semibold">
                              {v.tanker_number ?? t('stock.visit')}
                            </span>
                            {v.seal_number ? (
                              <span className="text-[12.5px] text-neutral-600">
                                {t('stock.seal')} {v.seal_number}
                              </span>
                            ) : null}
                            <span className="text-[12.5px] text-neutral-600">
                              {lines.length > 1
                                ? `${lines.length} × ${t('stock.tank').toLowerCase()} · ${litres(total)}`
                                : litres(total)}
                            </span>
                            {v.received_by_name ? (
                              <span className="text-[12.5px] text-neutral-600">
                                {v.received_by_name}
                              </span>
                            ) : null}
                          </div>
                        </td>
                      </tr>

                      {lines.map((d) => {
                        const cost = d.fuel_purchase_costs
                        // The manager reads a delivery; she does not write one,
                        // so she gets no pencil to type into and be refused.
                        if (!owner) {
                          return (
                            <tr key={d.id} className={rowClass}>
                              <Td className="font-medium">{d.tank_name}</Td>
                              <Td className="text-neutral-600">{d.fuel_name}</Td>
                              <Td className="tabular text-right text-neutral-600">
                                {d.invoice_litres != null ? litres(d.invoice_litres) : '—'}
                              </Td>
                              <Td className="tabular text-right font-semibold">
                                {litres(d.litres)}
                              </Td>
                              <Td />
                            </tr>
                          )
                        }
                        return (
                          <EditableRow
                            key={d.id}
                            span={owner ? 5 : 3}
                            label="Edit delivery"
                            cells={<>
                            <Td className="font-medium">{d.tank_name}</Td>
                            <Td className="text-neutral-600">{d.fuel_name}</Td>
                            <Td className="tabular text-right text-neutral-600">
                              {d.invoice_litres != null ? litres(d.invoice_litres) : '—'}
                            </Td>
                            <Td className="tabular text-right font-semibold">
                              {litres(d.litres)}
                              {d.invoice_variance != null && d.invoice_variance < -0.5 ? (
                                <div className="mt-1">
                                  <Badge tone="danger">
                                    {t('stock.shortDelivery')}{' '}
                                    {litres(Math.abs(d.invoice_variance))}
                                  </Badge>
                                </div>
                              ) : null}
                            </Td>
                            {owner ? (
                              <Fragment key="cost">
                                <Td className="tabular text-right">
                                  {cost ? Number(cost.rate_per_litre).toFixed(3) : '—'}
                                </Td>
                                <Td className="tabular text-right">
                                  {cost ? money(cost.amount) : '—'}
                                </Td>
                              </Fragment>
                            ) : null}
                            </>}
                            actions={
                              owner ? (
                                <DeleteButton
                                  action={deleteDelivery}
                                  fields={{ id: d.id }}
                                  label="Delete delivery"
                                />
                              ) : null
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
                    </Fragment>
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
