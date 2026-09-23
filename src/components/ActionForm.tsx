'use client'

import { createContext, useActionState, useContext, useEffect, useRef, useState } from 'react'
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

/*
 * One object, not a fresh `{}` on every render.
 *
 * Server side a render-phase update re-invokes the component, and a literal
 * passed to useActionState is built again each time — so "has the result
 * changed?" stayed true, the state adjusted again, and React gave up with
 * "Too many re-renders". Every page carrying a form answered 500.
 */
const NOTHING_YET: FormState = {}

/**
 * Whether anything in this form has been touched since it loaded or last
 * saved. Null when the form has nothing a person can type into — a delete
 * button, a toggle — where there is nothing to be dirty about and Save must
 * stay live.
 */
const DirtyContext = createContext<boolean | null>(null)

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
  const dirty = useContext(DirtyContext)

  // A Save button that is live when there is nothing to save invites people
  // to press it and wonder whether anything happened. It wakes when a field
  // changes and goes back to sleep once the change is in.
  const nothingToSave = dirty === false

  return (
    <Button
      type="submit"
      variant={variant}
      size={size}
      disabled={pending || disabled || nothingToSave}
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
  alwaysReady = false,
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
  /** For a form with nothing to type into: a delete, a toggle, an approval. */
  alwaysReady?: boolean
}) {
  const [state, formAction] = useActionState(action, NOTHING_YET)
  const ref = useRef<HTMLFormElement>(null)
  const close = useCloseDisclosure()

  /*
   * Whether anything has been typed since this loaded or last saved. A form
   * with nothing to type into — a delete button, an activate toggle — passes
   * alwaysReady, because pressing it IS the change and there is nothing to be
   * dirty about.
   */
  const [dirty, setDirty] = useState(false)

  // Back to clean the moment a save lands: adjusting state during render is
  // the supported way to derive it, and keeps it out of an effect. It settles
  // only because NOTHING_YET is one object rather than a fresh one per render.
  const [lastResult, setLastResult] = useState<FormState | null>(null)
  if (state !== lastResult) {
    setLastResult(state)
    if (state.ok) setDirty(false)
  }

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
    <form
      ref={ref}
      action={formAction}
      className={className}
      onInput={() => setDirty(true)}
      onChange={() => setDirty(true)}
    >
      <DirtyContext.Provider value={alwaysReady ? null : dirty}>
        {children}
      </DirtyContext.Provider>
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.ok && onDone ? <Alert tone="ok">{onDone}</Alert> : null}
    </form>
  )
}
