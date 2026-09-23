import { isOwner, requireBackOffice } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { getT } from '@/lib/i18n/server'
import { formatDate, litres } from '@/lib/format'
import type { FuelPrice, FuelType, Nozzle, Tank } from '@/lib/database.types'
import {
  Alert, Badge, Card, CardHeader, Empty, PageHeader, TableWrap, Td, Th,
} from '@/components/ui'
import { Collapsible } from '@/components/Collapsible'
import Link from 'next/link'
import { FuelForm, NozzleForm, TankForm } from '../SettingsForms'
import { NozzleToggle } from '../NozzleToggle'
import { EditableRow } from '@/components/EditableRow'
import { DeleteButton } from '@/components/DeleteButton'
import { EditFuelForm, EditNozzleForm, EditTankForm } from '../EquipmentForms'
import { deleteFuelType, deleteNozzle, deleteTank } from '../actions'

export const dynamic = 'force-dynamic'

interface NozzleRow extends Nozzle {
  tanks: { name: string } | null
  fuel_types: { name: string } | null
}

/**
 * The pump's equipment, on its own page.
 *
 * Fuels, tanks and nozzles used to sit under Settings with the pump's details
 * and the list of logins — six unrelated ideas, ten cards and four tables on
 * one screen. They belong together and apart from the rest: they are the one
 * thing a trigger refuses to delete once it has priced a sale, and they are
 * the owner's to change.
 */
export default async function EquipmentPage() {
  const session = await requireBackOffice()
  const owner = isOwner(session)
  const t = await getT()
  const supabase = await createClient()

  const [fuelsRes, pricesRes, tanksRes, nozzlesRes] = await Promise.all([
    supabase.from('fuel_types').select('*').order('sort_order'),
    supabase
      .from('fuel_prices')
      .select('*, fuel_types(name)')
      .order('effective_from', { ascending: false })
      .limit(40),
    supabase.from('tanks').select('*, fuel_types(name)').order('name'),
    supabase.from('nozzles').select('*, tanks(name), fuel_types(name)').order('sort_order'),
  ])

  const fuels = (fuelsRes.data ?? []) as FuelType[]
  const prices = (pricesRes.data ?? []) as unknown as (FuelPrice & {
    fuel_types: { name: string } | null
  })[]
  const tanks = (tanksRes.data ?? []) as unknown as (Tank & {
    fuel_types: { name: string } | null
  })[]
  const nozzles = (nozzlesRes.data ?? []) as unknown as NozzleRow[]

  // The newest row per fuel is the rate in force right now.
  const currentRate = new Map<string, FuelPrice>()
  for (const p of prices) {
    if (!currentRate.has(p.fuel_type_id)) currentRate.set(p.fuel_type_id, p)
  }

  return (
    <>
      <PageHeader title={t('set.equipment')} subtitle={t('set.equipmentHint')} />

      {/* ----------------------------------------------------- fuel rates -- */}
      <Card className="mb-5">
        <CardHeader
          title={t('set.fuels')}
          subtitle={t('set.fuelsAreEquipment')}
          action={
            <Link
              href="/rates"
              className="text-[12.5px] font-semibold whitespace-nowrap text-accent hover:underline"
            >
              {t('rate.today')} →
            </Link>
          }
        />
        {fuels.length === 0 ? (
          <Empty>{t('common.none')}</Empty>
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>{t('set.fuels')}</Th>
                <Th className="text-right">{t('set.currentRate')}</Th>
                <Th>{t('set.effectiveFrom')}</Th>
              </tr>
            </thead>
            <tbody>
              {fuels.map((f) => {
                const p = currentRate.get(f.id)
                const cells = (
                  <>
                    <Td>
                      <span className="font-medium">{f.name}</span>
                      {f.name_gu ? (
                        <span className="ml-2 text-neutral-600">{f.name_gu}</span>
                      ) : null}
                      <span className="ml-2 text-[12px] text-neutral-600">
                        /{f.unit}
                      </span>
                      {!f.is_active ? (
                        <span className="ml-2">
                          <Badge>{t('set.outOfUse')}</Badge>
                        </span>
                      ) : null}
                    </Td>
                    <Td className="tabular text-right font-semibold">
                      {p ? `₹${Number(p.sale_rate).toFixed(2)}` : '—'}
                    </Td>
                    <Td className="text-neutral-600">
                      {p ? formatDate(p.effective_from) : '—'}
                    </Td>
                  </>
                )
                return owner ? (
                  <EditableRow
                    key={f.id}
                    span={3}
                    label={`Edit ${f.name}`}
                    cells={cells}
                    actions={
                      <DeleteButton
                        action={deleteFuelType}
                        fields={{ id: f.id }}
                        label={`Delete ${f.name}`}
                      />
                    }
                    form={<EditFuelForm fuel={f} />}
                  />
                ) : (
                  <tr key={f.id}>{cells}</tr>
                )
              })}
            </tbody>
          </TableWrap>
        )}
        <div className="flex flex-col gap-3 border-t border-divider p-4">
          {owner ? (
            <Collapsible title={`${t('common.add')} — ${t('set.fuels')}`}>
              <FuelForm />
            </Collapsible>
          ) : (
            <Alert tone="accent">{t('set.equipmentOwnerOnly')}</Alert>
          )}
        </div>
      </Card>

      {/* ---------------------------------------------------------- tanks -- */}
      <Card className="mb-5">
        <CardHeader title={t('set.tanks')} />
        {tanks.length === 0 ? (
          <Empty>{t('common.none')}</Empty>
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>{t('common.name')}</Th>
                <Th>{t('set.fuels')}</Th>
                <Th className="text-right">{t('stock.capacity')}</Th>
                <Th className="text-right">{t('cust.openingBalance')}</Th>
              </tr>
            </thead>
            <tbody>
              {tanks.map((tk) => {
                const cells = (
                  <>
                    <Td className="font-medium">
                      {tk.name}
                      {!tk.is_active ? (
                        <span className="ml-2">
                          <Badge>{t('set.outOfUse')}</Badge>
                        </span>
                      ) : null}
                    </Td>
                    <Td>{tk.fuel_types?.name ?? '—'}</Td>
                    <Td className="tabular text-right">{litres(tk.capacity_litres)}</Td>
                    <Td className="tabular text-right text-neutral-600">
                      {litres(tk.opening_stock_litres)}
                      {tk.opening_stock_date ? (
                        <div className="text-sm">{formatDate(tk.opening_stock_date)}</div>
                      ) : null}
                    </Td>
                  </>
                )
                return owner ? (
                  <EditableRow
                    key={tk.id}
                    span={4}
                    label={`Edit ${tk.name}`}
                    cells={cells}
                    actions={
                      <DeleteButton
                        action={deleteTank}
                        fields={{ id: tk.id }}
                        label={`Delete ${tk.name}`}
                      />
                    }
                    form={<EditTankForm tank={tk} />}
                  />
                ) : (
                  <tr key={tk.id}>{cells}</tr>
                )
              })}
            </tbody>
          </TableWrap>
        )}
        <div className="border-t border-divider p-4">
          {!owner ? (
            <Alert tone="accent">{t('set.equipmentOwnerOnly')}</Alert>
          ) : fuels.length === 0 ? (
            <Alert tone="accent">Add a fuel before adding a tank.</Alert>
          ) : (
            <Collapsible title={`${t('common.add')} — ${t('set.tanks')}`}>
              <TankForm fuels={fuels} />
            </Collapsible>
          )}
        </div>
      </Card>

      {/* -------------------------------------------------------- nozzles -- */}
      <Card className="mb-5">
        <CardHeader title={t('set.nozzles')} />
        {nozzles.length === 0 ? (
          <Empty>{t('common.none')}</Empty>
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>{t('common.name')}</Th>
                <Th>{t('stock.tank')}</Th>
                <Th>{t('set.fuels')}</Th>
                <Th className="text-right">{t('common.status')}</Th>
              </tr>
            </thead>
            <tbody>
              {nozzles.map((nz) => {
                const cells = (
                  <>
                    <Td className="font-medium">{nz.name}</Td>
                    <Td>{nz.tanks?.name ?? '—'}</Td>
                    <Td>{nz.fuel_types?.name ?? '—'}</Td>
                    <Td className="text-right">
                      <NozzleToggle id={nz.id} active={nz.is_active} />
                    </Td>
                  </>
                )
                return owner ? (
                  <EditableRow
                    key={nz.id}
                    span={4}
                    label={`Edit ${nz.name}`}
                    cells={cells}
                    actions={
                      <DeleteButton
                        action={deleteNozzle}
                        fields={{ id: nz.id }}
                        label={`Delete ${nz.name}`}
                      />
                    }
                    form={<EditNozzleForm nozzle={nz} tanks={tanks} />}
                  />
                ) : (
                  <tr key={nz.id}>{cells}</tr>
                )
              })}
            </tbody>
          </TableWrap>
        )}
        <div className="border-t border-divider p-4">
          {!owner ? (
            <Alert tone="accent">{t('set.equipmentOwnerOnly')}</Alert>
          ) : tanks.length === 0 ? (
            <Alert tone="accent">Add a tank before adding a nozzle.</Alert>
          ) : (
            <Collapsible title={`${t('common.add')} — ${t('set.nozzles')}`}>
              <NozzleForm tanks={tanks} />
            </Collapsible>
          )}
        </div>
      </Card>
    </>
  )
}
