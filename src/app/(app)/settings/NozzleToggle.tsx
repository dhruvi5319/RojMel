'use client'

import { useT } from '@/lib/i18n/client'
import { Badge } from '@/components/ui'
import { ActionForm } from '@/components/ActionForm'
import { toggleNozzle } from './actions'

/** Tapping the badge takes a nozzle out of use, or puts it back. */
export function NozzleToggle({ id, active }: { id: string; active: boolean }) {
  const t = useT()
  return (
    <ActionForm action={toggleNozzle} className="inline-flex flex-col items-end gap-1">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="active" value={String(!active)} />
      <button type="submit" className="cursor-pointer">
        <Badge tone={active ? 'ok' : 'neutral'}>
          {active ? t('set.working') : t('set.outOfUse')}
        </Badge>
      </button>
    </ActionForm>
  )
}
