'use client'

import { useCallback, useState } from 'react'
import { Pencil, X } from 'lucide-react'
import { useT } from '@/lib/i18n/client'
import { DisclosureContext } from '@/components/Disclosure'

/**
 * Figures that are read until somebody says they mean to change them.
 *
 * A screen full of live inputs invites a sleeve to change a meter reading, and
 * it reads as a form to fill in rather than a book to look at — which is the
 * wrong way round for a page whose job is mostly to be checked. So what is
 * recorded is shown plainly, with one pencil; pressing it opens the form,
 * saving closes it, and what comes back is the same plain view with the new
 * figure in it.
 *
 * `EditableRow` is this same idea for a row inside a table. Both hand the form
 * a way to close itself through `DisclosureContext`, which is how `ActionForm`
 * gets out of the way after a save.
 */
export function Editable({
  view,
  form,
  label,
  can = true,
  locked,
}: {
  /** what is recorded, shown plainly */
  view: React.ReactNode
  /** the form that changes it */
  form: React.ReactNode
  /** what the pencil says it edits, for anyone not looking at the screen */
  label: string
  /** false where this person may look but not touch */
  can?: boolean
  /** a reason it cannot be changed at all, shown in place of the pencil */
  locked?: string
}) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])

  if (open) {
    return (
      <div className="rounded-[var(--radius-step)] bg-neutral-200 p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <span className="text-[13px] font-semibold text-neutral-800">{label}</span>
          <button
            type="button"
            onClick={close}
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[13px] font-semibold text-neutral-700 transition hover:bg-accent-100 hover:text-accent"
          >
            <X className="size-4" aria-hidden />
            {t('common.cancel')}
          </button>
        </div>
        <DisclosureContext.Provider value={close}>{form}</DisclosureContext.Provider>
      </div>
    )
  }

  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1">{view}</div>
      {locked ? (
        <span className="shrink-0 text-[12.5px] text-neutral-700">{locked}</span>
      ) : can ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={label}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-divider px-3 py-2 text-[13px] font-semibold text-neutral-800 transition hover:bg-accent-100 hover:text-accent"
        >
          <Pencil className="size-3.5" aria-hidden />
          {t('common.edit')}
        </button>
      ) : null}
    </div>
  )
}
