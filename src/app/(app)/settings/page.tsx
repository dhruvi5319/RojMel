import { isOwner, requireBackOffice } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { getT } from '@/lib/i18n/server'
import { formatDate, litres } from '@/lib/format'
import type {
  FuelPrice, FuelType, Nozzle, Profile, Tank,
} from '@/lib/database.types'
import {
  Alert, Badge, Card, CardHeader, Empty, PageHeader, TableWrap, Td, Th,
} from '@/components/ui'
import { Collapsible } from '@/components/Collapsible'
import { LanguageToggle } from '@/components/LanguageToggle'
import {
  FuelForm, NozzleForm, RateForm, StationForm, TankForm,
} from './SettingsForms'
import { NozzleToggle } from './NozzleToggle'

export const dynamic = 'force-dynamic'

interface NozzleRow extends Nozzle {
  tanks: { name: string } | null
  fuel_types: { name: string } | null
}

export default async function SettingsPage() {
  const session = await requireBackOffice()
  const t = await getT()
  const supabase = await createClient()

  const [fuelsRes, pricesRes, tanksRes, nozzlesRes, peopleRes] = await Promise.all([
    supabase.from('fuel_types').select('*').order('sort_order'),
    supabase
      .from('fuel_prices')
      .select('*, fuel_types(name)')
      .order('effective_from', { ascending: false })
      .limit(40),
    supabase.from('tanks').select('*, fuel_types(name)').order('name'),
    supabase.from('nozzles').select('*, tanks(name), fuel_types(name)').order('sort_order'),
    supabase.from('profiles').select('*').order('role').order('full_name'),
  ])

  const fuels = (fuelsRes.data ?? []) as FuelType[]
  const prices = (pricesRes.data ?? []) as unknown as (FuelPrice & {
    fuel_types: { name: string } | null
  })[]
  const tanks = (tanksRes.data ?? []) as unknown as (Tank & {
    fuel_types: { name: string } | null
  })[]
  const nozzles = (nozzlesRes.data ?? []) as unknown as NozzleRow[]
  const people = (peopleRes.data ?? []) as Profile[]

  // The newest row per fuel is the rate in force right now.
  const currentRate = new Map<string, FuelPrice>()
  for (const p of prices) {
    if (!currentRate.has(p.fuel_type_id)) currentRate.set(p.fuel_type_id, p)
  }

  return (
    <>
      <PageHeader title={t('set.title')} />

      <div className="mb-5 flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3">
        <span className="font-medium">{t('set.language')}</span>
        <LanguageToggle />
      </div>

      {/* -------------------------------------------------------- station -- */}
      <Card className="mb-5">
        <CardHeader
          title={t('set.station')}
          subtitle={isOwner(session) ? undefined : t('rep.ownerOnly')}
        />
        <div className="p-5">
          {isOwner(session) ? (
            <StationForm station={session.station} />
          ) : (
            <dl className="grid gap-3 sm:grid-cols-2">
              <Detail label={t('common.name')} value={session.station.name} />
              <Detail label={t('cust.gstin')} value={session.station.gstin} />
              <Detail label={t('cust.address')} value={session.station.address} />
              <Detail label={t('common.phone')} value={session.station.phone} />
            </dl>
          )}
        </div>
      </Card>

      {/* ----------------------------------------------------- fuel rates -- */}
      <Card className="mb-5">
        <CardHeader
          title={t('set.fuels')}
          subtitle="Changing a rate adds a new one; older slips keep their old price"
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
                return (
                  <tr key={f.id}>
                    <Td>
                      <span className="font-medium">{f.name}</span>
                      {f.name_gu ? (
                        <span className="ml-2 text-muted">{f.name_gu}</span>
                      ) : null}
                    </Td>
                    <Td className="tabular text-right font-semibold">
                      {p ? `₹${Number(p.sale_rate).toFixed(2)}` : '—'}
                    </Td>
                    <Td className="text-muted">
                      {p ? formatDate(p.effective_from) : '—'}
                    </Td>
                  </tr>
                )
              })}
            </tbody>
          </TableWrap>
        )}
        <div className="flex flex-col gap-3 border-t border-border p-4">
          {fuels.length > 0 ? (
            <Collapsible title={t('set.newRate')} defaultOpen>
              <RateForm fuels={fuels} />
            </Collapsible>
          ) : null}
          <Collapsible title={`${t('common.add')} — ${t('set.fuels')}`}>
            <FuelForm />
          </Collapsible>
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
              {tanks.map((tk) => (
                <tr key={tk.id}>
                  <Td className="font-medium">{tk.name}</Td>
                  <Td>{tk.fuel_types?.name ?? '—'}</Td>
                  <Td className="tabular text-right">{litres(tk.capacity_litres)}</Td>
                  <Td className="tabular text-right text-muted">
                    {litres(tk.opening_stock_litres)}
                    {tk.opening_stock_date ? (
                      <div className="text-sm">{formatDate(tk.opening_stock_date)}</div>
                    ) : null}
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
        <div className="border-t border-border p-4">
          {fuels.length === 0 ? (
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
              {nozzles.map((nz) => (
                <tr key={nz.id}>
                  <Td className="font-medium">{nz.name}</Td>
                  <Td>{nz.tanks?.name ?? '—'}</Td>
                  <Td>{nz.fuel_types?.name ?? '—'}</Td>
                  <Td className="text-right">
                    <NozzleToggle id={nz.id} active={nz.is_active} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
        <div className="border-t border-border p-4">
          {tanks.length === 0 ? (
            <Alert tone="accent">Add a tank before adding a nozzle.</Alert>
          ) : (
            <Collapsible title={`${t('common.add')} — ${t('set.nozzles')}`}>
              <NozzleForm tanks={tanks} />
            </Collapsible>
          )}
        </div>
      </Card>

      {/* --------------------------------------------------------- people -- */}
      <Card>
        <CardHeader
          title={t('set.people')}
          subtitle="Logins are created in the Supabase dashboard, then given a role here"
        />
        <TableWrap>
          <thead>
            <tr>
              <Th>{t('common.name')}</Th>
              <Th>{t('common.phone')}</Th>
              <Th className="text-right">{t('common.status')}</Th>
            </tr>
          </thead>
          <tbody>
            {people.map((p) => (
              <tr key={p.id}>
                <Td>
                  <span className="font-medium">{p.full_name}</span>
                  {p.id === session.profile.id ? (
                    <span className="ml-2 text-sm text-muted">(you)</span>
                  ) : null}
                </Td>
                <Td className="text-muted">{p.phone ?? '—'}</Td>
                <Td className="text-right">
                  <Badge tone={p.role === 'owner' ? 'brand' : 'neutral'}>
                    {t(`role.${p.role}`)}
                  </Badge>
                </Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
        {!isOwner(session) ? (
          <div className="border-t border-border p-4">
            <Alert tone="brand">Only an owner can change who has access.</Alert>
          </div>
        ) : null}
      </Card>
    </>
  )
}

function Detail({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="font-medium">{value || '—'}</dd>
    </div>
  )
}
