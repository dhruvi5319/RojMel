'use client'

import { useState } from 'react'
import { Pencil, X } from 'lucide-react'

/**
 * A table row that opens an edit form beneath itself. Correcting a mistyped
 * amount should not mean deleting the entry and typing it again.
 */
export function EditableRow({
  cells,
  span,
  form,
  actions,
  label,
}: {
  cells: React.ReactNode
  span: number
  form: React.ReactNode
  actions?: React.ReactNode
  label: string
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <tr className={open ? 'bg-surface-2' : undefined}>
        {cells}
        <td className="border-b border-border px-4 py-3 align-middle">
          <div className="flex items-center justify-end gap-1">
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-label={label}
              aria-expanded={open}
              className="rounded-lg p-2 text-muted transition hover:bg-brand-soft hover:text-brand"
            >
              {open ? (
                <X className="size-4" aria-hidden />
              ) : (
                <Pencil className="size-4" aria-hidden />
              )}
            </button>
            {actions}
          </div>
        </td>
      </tr>
      {open ? (
        <tr>
          <td colSpan={span + 1} className="border-b border-border bg-surface-2 p-4">
            {form}
          </td>
        </tr>
      ) : null}
    </>
  )
}
