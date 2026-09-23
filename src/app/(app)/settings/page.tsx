import { isOwner, requireBackOffice } from '@/lib/auth'
import { getT } from '@/lib/i18n/server'
import { Card, CardHeader, PageHeader } from '@/components/ui'
import { Editable } from '@/components/Editable'
import { LanguageSeg } from '@/components/AppNav'
import Link from 'next/link'
import { StationForm } from './SettingsForms'

export const dynamic = 'force-dynamic'

/**
 * The pump itself: what it is called, what it prints on a bill, and when its
 * shifts change over. Its equipment and its logins are their own pages — this
 * one used to hold six unrelated ideas, ten cards and four tables.
 */
export default async function SettingsPage() {
  const session = await requireBackOffice()
  const t = await getT()

  return (
    <>
      <PageHeader title={t('set.title')} />

      <div className="mb-5 flex items-center justify-between gap-3 rounded-xl border border-divider bg-surface px-4 py-3">
        <span className="font-medium">{t('set.language')}</span>
        <LanguageSeg />
      </div>

      {/* -------------------------------------------------------- station -- */}
      <Card className="mb-5">
        <CardHeader
          title={t('set.station')}
          subtitle={isOwner(session) ? undefined : t('rep.ownerOnly')}
        />
        <div className="p-5">
          {/* What the pump is, read plainly, with one pencil. It used to be a
              page of live inputs whether you had come to change anything or
              not. */}
          <Editable
            label={t('set.station')}
            can={isOwner(session)}
            form={<StationForm station={session.station} />}
            view={
              <dl className="grid gap-3 sm:grid-cols-2">
                <Detail label={t('common.name')} value={session.station.name} />
                <Detail label={t('set.legalName')} value={session.station.legal_name} />
                <Detail label={t('cust.gstin')} value={session.station.gstin} />
                <Detail label={t('common.phone')} value={session.station.phone} />
                <Detail label={t('cust.address')} value={session.station.address} />
                <Detail
                  label={t('set.shiftHours')}
                  value={`${session.station.day_starts_at.slice(0, 5)} – ${session.station.night_starts_at.slice(0, 5)}`}
                />
              </dl>
            }
          />
        </div>
      </Card>

      {/* The equipment is its own page: six unrelated ideas on one screen
          was a junk drawer, and these are the owner's to change. */}
      <Card className="mb-5">
        <CardHeader title={t('set.equipment')} subtitle={t('set.equipmentHint')} />
        <div className="p-5">
          <Link href="/settings/equipment" className="font-semibold text-accent hover:underline">
            {t('set.equipment')} →
          </Link>
        </div>
      </Card>

      <Card>
        <CardHeader title={t('set.people')} subtitle={t('set.peopleElsewhere')} />
        <div className="p-5">
          <Link href="/people" className="font-semibold text-accent hover:underline">
            {t('nav.people')} →
          </Link>
        </div>
      </Card>

    </>
  )
}

function Detail({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-sm text-neutral-600">{label}</dt>
      <dd className="font-medium">{value || '—'}</dd>
    </div>
  )
}
