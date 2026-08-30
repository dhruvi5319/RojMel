'use client'

import { Printer } from 'lucide-react'
import { useT } from '@/lib/i18n/client'
import { Button } from '@/components/ui'

export function PrintButton() {
  const t = useT()
  return (
    <Button type="button" variant="secondary" size="sm" onClick={() => window.print()}>
      <Printer className="size-4" aria-hidden />
      {t('common.print')}
    </Button>
  )
}
