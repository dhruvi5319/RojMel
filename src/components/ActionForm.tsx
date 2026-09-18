'use client'

import { useActionState, useEffect, useRef } from 'react'
import { useFormStatus } from 'react-dom'
import { useT } from '@/lib/i18n/client'
import { Alert, Button } from '@/components/ui'
import { useCloseDisclosure } from '@/components/Disclosure'

export type { FormState } from '@/lib/actions'
import type { FormState } from '@/lib/actions'

export type FormAction = (
  prev: FormState,
  data: FormData,
) => Promise<FormState>

/** Submit button that knows when its own form is in flight. */
export function SubmitButton({
  children,
  variant,
  size = 'lg',
  disabled = false,
}: {
  children?: React.ReactNode
  variant?: 'primary' | 'secondary' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  /** For a form that has nothing to submit yet. */
  disabled?: boolean
}) {
  const t = useT()
  const { pending } = useFormStatus()
  return (
    <Button
      type="submit"
      variant={variant}
      size={size}
      disabled={pending || disabled}
    >
      {pending ? t('common.saving') : (children ?? t('common.save'))}
    </Button>
  )
}

/**
 * Wraps a server action and shows whatever went wrong right above the button,
 * where the person who pressed it is already looking.
 */
export function ActionForm({
  action,
  children,
  className = 'flex flex-col gap-4',
  onDone,
  resetOnSuccess = false,
  onSuccess,
  stayOpen = false,
}: {
  action: FormAction
  children: React.ReactNode
  className?: string
  onDone?: React.ReactNode
  /** For add-forms: clear the fields once the entry is saved. */
  resetOnSuccess?: boolean
  /** For a form whose shape is state, not fields — reset() cannot reach it. */
  onSuccess?: () => void
  /** For a form meant to be used again straight away. */
  stayOpen?: boolean
}) {
  const [state, formAction] = useActionState(action, {})
  const ref = useRef<HTMLFormElement>(null)
  const close = useCloseDisclosure()

  useEffect(() => {
    if (!state.ok) return
    if (resetOnSuccess) ref.current?.reset()
    onSuccess?.()

    // Long enough to read "Saved", then the panel gets out of the way — a
    // form still sitting open with its fields full reads as "nothing
    // happened", which is the one thing it must not say.
    if (!stayOpen && close) {
      const t = setTimeout(close, 900)
      return () => clearTimeout(t)
    }
    // The callbacks are fresh closures each render; only a new result should
    // fire them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetOnSuccess, state])

  return (
    <form ref={ref} action={formAction} className={className}>
      {children}
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.ok && onDone ? <Alert tone="ok">{onDone}</Alert> : null}
    </form>
  )
}
