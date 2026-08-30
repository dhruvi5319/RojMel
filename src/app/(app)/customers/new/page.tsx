import { requireBackOffice } from '@/lib/auth'
import { getT } from '@/lib/i18n/server'
import { Card, LinkButton, PageHeader } from '@/components/ui'
import { ActionForm, SubmitButton } from '@/components/ActionForm'
import { CustomerFields } from '../CustomerFields'
import { createCustomer } from '../actions'

export default async function NewCustomerPage() {
  await requireBackOffice()
  const t = await getT()

  return (
    <>
      <PageHeader
        title={t('cust.new')}
        action={
          <LinkButton href="/customers" variant="secondary" size="sm">
            {t('common.back')}
          </LinkButton>
        }
      />
      <Card className="p-5">
        <ActionForm action={createCustomer}>
          <CustomerFields />
          <div>
            <SubmitButton>{t('common.save')}</SubmitButton>
          </div>
        </ActionForm>
      </Card>
    </>
  )
}
