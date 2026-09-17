import { requireOwner } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { getT } from '@/lib/i18n/server'
import { formatDate, formatTime, todayIST } from '@/lib/format'
import {
  Badge, Card, Empty, PageHeader, Stat, TableWrap, Td, Th, rowClass,
} from '@/components/ui'

export const dynamic = 'force-dynamic'

interface Entry {
  id: number
  actor_id: string | null
  actor_name: string
  actor_role: string | null
  action: string
  entity: string
  entity_id: string | null
  details: Record<string, unknown> | null
  created_at: string
}

/** How each recorded action should read, and how loudly. */
const ACTIONS: Record<string, { label: string; tone: 'accent' | 'ok' | 'neutral' | 'danger' }> = {
  insert: { label: 'Added', tone: 'neutral' },
  update: { label: 'Changed', tone: 'accent' },
  delete: { label: 'Deleted', tone: 'danger' },
  approve_day: { label: 'Approved day', tone: 'ok' },
  reopen_day: { label: 'Reopened day', tone: 'accent' },
}

/** The tables, in the words the pump uses for them. */
const ENTITIES: Record<string, string> = {
  nozzle_readings: 'Meter reading',
  shift_collections: 'Handover',
  cng_readings: 'CNG reading',
  credit_sales: 'Udhaar slip',
  fuel_prices: 'Rate',
  fuel_types: 'Fuel',
  tanks: 'Tank',
  nozzles: 'Nozzle',
  cng_dispensers: 'CNG dispenser',
  fuel_purchases: 'Tanker delivery',
  fuel_purchase_costs: 'Purchase cost',
  cng_supply: 'Gas supply',
  cng_supply_costs: 'Gas cost',
  tank_dips: 'Dip',
  bank_deposits: 'Bank deposit',
  staff_payments: 'Staff payment',
  day_closings: 'Day close',
  customers: 'Customer',
  vehicles: 'Vehicle',
  invoices: 'Invoice',
  payments: 'Payment received',
  expenses: 'Expense',
  staff: 'Staff',
  shifts: 'Shift',
  profiles: 'Login',
  stations: 'Pump details',
}

/** Fields worth showing in a one-line summary, in this order. */
const INTERESTING = [
  'amount', 'sale_rate', 'litres', 'quantity', 'closing_reading', 'dip_litres',
  'scm_received', 'counted_cash', 'credit_limit', 'name', 'category',
  'bank_name', 'status', 'is_active', 'reason', 'remarks', 'date',
]

function summarise(action: string, details: Record<string, unknown> | null): string {
  if (!details) return '—'

  // An update stores [was, now] per changed field.
  if (action === 'update') {
    const parts = Object.entries(details)
      .filter(([, v]) => Array.isArray(v) && v.length === 2)
      .map(([k, v]) => {
        const [was, now] = v as [unknown, unknown]
        return `${k}: ${fmt(was)} → ${fmt(now)}`
      })
    return parts.length ? parts.slice(0, 3).join(' · ') : '—'
  }

  const shown = INTERESTING.filter((k) => details[k] != null && details[k] !== '')
    .slice(0, 3)
    .map((k) => `${k}: ${fmt(details[k])}`)
  return shown.length ? shown.join(' · ') : '—'
}

const fmt = (v: unknown) =>
  v === null || v === undefined || v === '' ? '—' : String(v)

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ entity?: string; action?: string }>
}) {
  // audit_log has an owner-only select policy; requireOwner keeps a manager
  // from reaching a page that would only ever render empty for her.
  await requireOwner()
  const t = await getT()
  const supabase = await createClient()
  const today = todayIST()

  const sp = await searchParams
  let query = supabase
    .from('v_audit')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(300)

  if (sp.entity) query = query.eq('entity', sp.entity)
  if (sp.action) query = query.eq('action', sp.action)

  const { data } = await query

  const entries = (data ?? []) as unknown as Entry[]
  const todayCount = entries.filter((e) => e.created_at.slice(0, 10) === today).length
  const reopened = entries.filter(
    (e) => e.action === 'reopen_day' && e.created_at.slice(0, 7) === today.slice(0, 7),
  ).length
  const deletions = entries.filter(
    (e) => e.action === 'delete' && e.created_at.slice(0, 10) === today,
  ).length

  return (
    <>
      <PageHeader title={t('nav.audit')} />

      <p className="mb-5 max-w-3xl text-[13px] text-neutral-600">
        Every insert, update and delete across the books is recorded by a
        database trigger — so it cannot be skipped by a new screen — and only an
        owner can read it back. An update shows what the figure was before
        somebody moved it.
      </p>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label="Entries today" value={String(todayCount)} />
        <Stat
          label="Deletions today"
          value={String(deletions)}
          tone={deletions > 0 ? 'danger' : 'plain'}
        />
        <Stat
          label="Days reopened this month"
          value={String(reopened)}
          tone={reopened > 0 ? 'accent' : 'plain'}
        />
      </div>

      <Card className="overflow-hidden pb-1">
        {entries.length === 0 ? (
          <Empty>{t('common.none')}</Empty>
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>When</Th>
                <Th>Who</Th>
                <Th>Did what</Th>
                <Th>To</Th>
                <Th>Change</Th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => {
                const a = ACTIONS[e.action] ?? { label: e.action, tone: 'neutral' as const }
                const detail = summarise(e.action, e.details)
                return (
                  <tr key={e.id} className={rowClass}>
                    <Td className="tabular whitespace-nowrap text-neutral-700">
                      {formatDate(e.created_at)} · {formatTime(e.created_at)}
                    </Td>
                    <Td>
                      {e.actor_name}
                      {e.actor_role ? (
                        <span className="ml-2 text-[11.5px] text-neutral-600">
                          {t(`role.${e.actor_role as 'owner'}`)}
                        </span>
                      ) : null}
                    </Td>
                    <Td>
                      <Badge tone={a.tone}>{a.label}</Badge>
                    </Td>
                    <Td className="text-neutral-700">
                      {ENTITIES[e.entity] ?? e.entity}
                    </Td>
                    <Td className="tabular max-w-[22rem] truncate text-neutral-700">
                      {detail}
                    </Td>
                  </tr>
                )
              })}
            </tbody>
          </TableWrap>
        )}
      </Card>
    </>
  )
}
