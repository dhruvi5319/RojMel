import { requireOwner } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { getT } from '@/lib/i18n/server'
import { formatDate, formatTime, todayIST } from '@/lib/format'
import {
  Badge, Card, Empty, PageHeader, Proposal, Stat, TableWrap, Td, Th, rowClass,
} from '@/components/ui'

export const dynamic = 'force-dynamic'

interface Entry {
  id: number
  actor_id: string | null
  action: string
  entity: string
  entity_id: string | null
  details: Record<string, unknown> | null
  created_at: string
  profiles: { full_name: string; role: string } | null
}

/** How each recorded action should read, and how loudly. */
const ACTIONS: Record<string, { label: string; tone: 'accent' | 'ok' | 'neutral' }> = {
  approve_day: { label: 'Approved day', tone: 'ok' },
  reopen_day: { label: 'Reopened day', tone: 'accent' },
}

export default async function AuditPage() {
  // audit_log has an owner-only select policy; requireOwner keeps a manager
  // from reaching a page that would only ever render empty for her.
  await requireOwner()
  const t = await getT()
  const supabase = await createClient()
  const today = todayIST()

  const { data } = await supabase
    .from('audit_log')
    .select('*, profiles(full_name, role)')
    .order('created_at', { ascending: false })
    .limit(200)

  const entries = (data ?? []) as unknown as Entry[]
  const todayCount = entries.filter((e) => e.created_at.slice(0, 10) === today).length
  const reopened = entries.filter(
    (e) => e.action === 'reopen_day' && e.created_at.slice(0, 7) === today.slice(0, 7),
  ).length

  return (
    <>
      <PageHeader title={t('nav.audit')} />

      <p className="mb-4 max-w-3xl text-[13px] text-neutral-600">
        Every approval and reopening is recorded to{' '}
        <span className="tabular font-semibold">audit_log</span>, and its policy
        lets only an owner read it back.
      </p>

      <div className="mb-5 flex items-center gap-2">
        <Proposal />
        <span className="text-[12.5px] text-neutral-600">
          The table and its owner-only policy are real; this view is new.
        </span>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label="Entries today" value={String(todayCount)} />
        <Stat label="Entries kept" value={String(entries.length)} />
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
                const detail = e.details
                  ? Object.entries(e.details)
                      .filter(([, v]) => v != null && v !== '')
                      .map(([k, v]) => `${k}: ${String(v)}`)
                      .join(' · ')
                  : '—'
                return (
                  <tr key={e.id} className={rowClass}>
                    <Td className="tabular whitespace-nowrap text-neutral-700">
                      {formatDate(e.created_at)} · {formatTime(e.created_at)}
                    </Td>
                    <Td>
                      {e.profiles?.full_name ?? '—'}
                      {e.profiles?.role ? (
                        <span className="ml-2 text-[11.5px] text-neutral-600">
                          {t(`role.${e.profiles.role as 'owner'}`)}
                        </span>
                      ) : null}
                    </Td>
                    <Td>
                      <Badge tone={a.tone}>{a.label}</Badge>
                    </Td>
                    <Td className="tabular text-neutral-700">{e.entity}</Td>
                    <Td className="tabular text-neutral-700">{detail}</Td>
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
