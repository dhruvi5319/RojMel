'use client'

import { useState } from 'react'
import { ChevronDown, Plus } from 'lucide-react'

/** An add-form that stays out of the way until it is wanted. */
export function Collapsible({
  title,
  defaultOpen = false,
  children,
}: {
  title: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="no-print rounded-xl border border-divider bg-surface">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left font-semibold"
      >
        <span className="inline-flex items-center gap-2">
          <Plus className="size-4 text-accent" aria-hidden />
          {title}
        </span>
        <ChevronDown
          className={`size-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>
      {open ? <div className="border-t border-divider p-4 sm:p-5">{children}</div> : null}
    </div>
  )
}
