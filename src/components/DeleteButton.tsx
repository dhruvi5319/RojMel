'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { Trash2 } from 'lucide-react'
import type { FormState } from '@/lib/actions'

function Icon({ label }: { label: string }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      aria-label={label}
      disabled={pending}
      className="rounded-lg p-2 text-muted transition hover:bg-danger-soft hover:text-danger disabled:opacity-40"
    >
      <Trash2 className="size-4" aria-hidden />
    </button>
  )
}

/**
 * A row-level delete that says so when it does not work — an approved day or a
 * missing permission would otherwise look like a button that does nothing.
 */
export function DeleteButton({
  action,
  fields,
  label,
}: {
  action: (prev: FormState, data: FormData) => Promise<FormState>
  fields: Record<string, string>
  label: string
}) {
  const [state, formAction] = useActionState(action, {})

  return (
    <form action={formAction} className="inline-flex flex-col items-end gap-1">
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <Icon label={label} />
      {state.error ? (
        <span className="max-w-[16rem] text-right text-xs text-danger">
          {state.error}
        </span>
      ) : null}
    </form>
  )
}
