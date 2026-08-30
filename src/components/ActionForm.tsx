'use client'

import { useActionState, useEffect, useRef } from 'react'
import { useFormStatus } from 'react-dom'
import { useT } from '@/lib/i18n/client'
import { Alert, Button } from '@/components/ui'

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
}: {
  children?: React.ReactNode
  variant?: 'primary' | 'secondary' | 'danger'
  size?: 'sm' | 'md' | 'lg'
}) {
  const t = useT()
  const { pending } = useFormStatus()
  return (
    <Button type="submit" variant={variant} size={size} disabled={pending}>
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
}: {
  action: FormAction
  children: React.ReactNode
  className?: string
  onDone?: React.ReactNode
  /** For add-forms: clear the fields once the entry is saved. */
  resetOnSuccess?: boolean
}) {
  const [state, formAction] = useActionState(action, {})
  const ref = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (resetOnSuccess && state.ok) ref.current?.reset()
  }, [resetOnSuccess, state])

  return (
    <form ref={ref} action={formAction} className={className}>
      {children}
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.ok && onDone ? <Alert tone="ok">{onDone}</Alert> : null}
    </form>
  )
}
