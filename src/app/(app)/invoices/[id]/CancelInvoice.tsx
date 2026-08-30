'use client'

import { useT } from '@/lib/i18n/client'
import { ActionForm, SubmitButton } from '@/components/ActionForm'
import { cancelInvoice } from '../actions'

export function CancelInvoice({ id }: { id: string }) {
  const t = useT()
  return (
    <ActionForm action={cancelInvoice} className="flex flex-col gap-2">
      <input type="hidden" name="id" value={id} />
      <div>
        <SubmitButton variant="secondary" size="sm">
          {t('inv.cancel')}
        </SubmitButton>
      </div>
      <p className="text-sm text-muted">
        Cancelling releases the slips so they can go on a corrected bill.
      </p>
    </ActionForm>
  )
}
