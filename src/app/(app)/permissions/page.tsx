import { requireBackOffice } from '@/lib/auth'
import { getT } from '@/lib/i18n/server'
import {
  Badge, Card, CardHeader, PageHeader, Proposal, TableWrap, Td, Th, rowClass,
} from '@/components/ui'

/**
 * Read straight off supabase/migrations/0002_rls.sql. Nobody could previously
 * see the rules they work under, which matters most for the manager: she is
 * not a cut-down owner, she runs the pump, and exactly six things are not hers.
 */
export const dynamic = 'force-dynamic'

const ROLES = [
  {
    name: 'Owner',
    scope: 'Everything',
    detail:
      'Father and brother. Full visibility with no exceptions — cost, margin, the audit trail, and the only signature that closes a day.',
  },
  {
    name: 'Manager',
    scope: 'Everything but six',
    detail:
      "Billing, customers, prices, stock, staff, expenses, bank, and counting the day's cash. Never what the fuel cost to buy.",
  },
  {
    name: 'Counter device',
    scope: 'Today, write-only',
    detail:
      'Shared at the nozzle. Writes readings and slips for an open shift today; sees no money beyond the slip in hand.',
  },
] as const

const OWNER_ONLY = [
  {
    what: 'Purchase cost, purchase rate, supplier',
    why: 'Its own table, so it cannot leak through a join',
    where: 'fuel_purchase_costs · owner policy',
    manager: 'No rows',
    tone: 'neutral' as const,
  },
  {
    what: 'Margin and gross profit',
    why: 'The page redirects, then the function refuses',
    where: 'margin_report() · requireOwner()',
    manager: 'Refused',
    tone: 'neutral' as const,
  },
  {
    what: 'Approving or reopening a day',
    why: 'She counts the cash and sends it; only an owner locks it',
    where: 'day_closings · lock trigger',
    manager: 'Refused',
    tone: 'neutral' as const,
  },
  {
    what: "Editing the pump's own details",
    why: 'Name, GSTIN, address, phone — she reads them',
    where: 'stations · owner update only',
    manager: 'Read',
    tone: 'ok' as const,
  },
  {
    what: 'Who logs in, and as what',
    why: 'She sees the list; she cannot change a role — including her own',
    where: 'profiles · owner write',
    manager: 'Read',
    tone: 'ok' as const,
  },
  {
    what: 'The audit trail',
    why: 'Anyone may write to it; only an owner can read it back',
    where: 'audit_log · owner select',
    manager: 'No rows',
    tone: 'neutral' as const,
  },
]

const EVERYTHING_ELSE: {
  table: string
  counter: string
  counterTone: 'ok' | 'neutral' | 'outline'
}[] = [
  { table: 'Fuels, rates, tanks, nozzles', counter: 'Read', counterTone: 'ok' },
  { table: 'Staff and their counter PINs', counter: 'Read', counterTone: 'ok' },
  { table: 'Customers, vehicles', counter: 'Read', counterTone: 'ok' },
  {
    table: 'Shifts',
    counter: 'Open one today · see yesterday',
    counterTone: 'outline',
  },
  {
    table: 'Meter readings, handover',
    counter: 'Write while the shift is open',
    counterTone: 'outline',
  },
  {
    table: 'Credit slips',
    counter: "Write today's, unbilled only",
    counterTone: 'outline',
  },
  { table: 'Invoices, payments received', counter: 'None', counterTone: 'neutral' },
  { table: 'Stock: litres, dips, deliveries', counter: 'None', counterTone: 'neutral' },
  { table: 'Expenses, staff pay, bank deposits', counter: 'None', counterTone: 'neutral' },
  { table: 'Day close: count and send', counter: 'None', counterTone: 'neutral' },
]

export default async function PermissionsPage() {
  await requireBackOffice()
  const t = await getT()

  return (
    <>
      <PageHeader title={t('nav.permissions')} />

      <p className="mb-4 max-w-3xl text-[13.5px] text-neutral-700">
        Read straight off{' '}
        <span className="tabular font-semibold">0002_rls.sql</span>. The manager
        is not a cut-down owner — she runs the pump, and holds full read and
        write on most of the books. <b>Six things belong to the owner alone.</b>
      </p>

      <div className="mb-6 flex items-center gap-2">
        <Proposal />
        <span className="text-[12.5px] text-neutral-600">
          This screen is new — nobody could previously see the rules they work under.
        </span>
      </div>

      <div className="mb-6 grid gap-3 md:grid-cols-3">
        {ROLES.map((r) => (
          <Card key={r.name} className="px-5 py-4">
            <div className="font-[family-name:var(--font-heading)] text-[19px]">
              {r.name}
            </div>
            <div className="mt-0.5 text-[12.5px] font-semibold text-accent">
              {r.scope}
            </div>
            <p className="mt-2 text-[13px] text-neutral-700">{r.detail}</p>
          </Card>
        ))}
      </div>

      <Card className="mb-6 overflow-hidden pb-1">
        <CardHeader title="The six that are the owner's alone" />
        <TableWrap>
          <thead>
            <tr>
              <Th>What</Th>
              <Th>Where it is enforced</Th>
              <Th className="text-right">Manager gets</Th>
            </tr>
          </thead>
          <tbody>
            {OWNER_ONLY.map((row) => (
              <tr key={row.what} className={rowClass}>
                <Td>
                  <span className="font-semibold">{row.what}</span>
                  <div className="text-[12px] text-neutral-600">{row.why}</div>
                </Td>
                <Td className="tabular text-[12.5px] text-neutral-700">{row.where}</Td>
                <Td className="text-right">
                  <Badge tone={row.tone}>{row.manager}</Badge>
                </Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      </Card>

      <Card className="overflow-hidden pb-1">
        <CardHeader title="Everything else" />
        <TableWrap>
          <thead>
            <tr>
              <Th>Table</Th>
              <Th className="text-right">Owner</Th>
              <Th className="text-right">Manager</Th>
              <Th className="text-right">Counter</Th>
            </tr>
          </thead>
          <tbody>
            {EVERYTHING_ELSE.map((row) => (
              <tr key={row.table} className={rowClass}>
                <Td>{row.table}</Td>
                <Td className="text-right">
                  <Badge tone="accent">Read &amp; write</Badge>
                </Td>
                <Td className="text-right">
                  <Badge tone="accent">Read &amp; write</Badge>
                </Td>
                <Td className="text-right">
                  <Badge tone={row.counterTone}>{row.counter}</Badge>
                </Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
        <p className="px-5 py-4 text-[12.5px] text-neutral-600">
          Two gaps worth naming: a counter device can read the{' '}
          <b>customers</b> table, so a filler could in principle browse every
          credit customer&rsquo;s name — the app only ever shows the picker; and
          anyone may write to the audit trail, only an owner may read it back.
        </p>
      </Card>
    </>
  )
}
