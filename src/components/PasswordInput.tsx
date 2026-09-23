'use client'

import { useState, type ComponentProps } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { useT } from '@/lib/i18n/client'

const controlBase =
  'w-full min-h-[42px] rounded-full border border-divider bg-bg pl-4 pr-11 py-2 text-[15px] ' +
  'outline-none transition hover:border-neutral-500 focus-visible:border-accent ' +
  'disabled:opacity-50 disabled:cursor-not-allowed'

/**
 * A password typed in to sign yourself in, with a way to check it before
 * pressing the button rather than after it fails.
 *
 * This is only for a password somebody is entering to authenticate as
 * themselves — sign-in, and the account page's "type your new one twice".
 * On `/people`, the owner is instead handing a fresh password to someone
 * else to write down, and that field stays plain text: there is nobody's
 * secret on the screen to hide from a shoulder behind the owner.
 */
export function PasswordInput({ className = '', ...rest }: ComponentProps<'input'>) {
  const t = useT()
  const [shown, setShown] = useState(false)

  return (
    <div className="relative">
      <input
        type={shown ? 'text' : 'password'}
        className={`${controlBase} ${className}`}
        {...rest}
      />
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        aria-label={shown ? t('auth.hidePassword') : t('auth.showPassword')}
        aria-pressed={shown}
        tabIndex={-1}
        className="absolute inset-y-0 right-1 grid w-9 place-items-center text-neutral-600 transition hover:text-text"
      >
        {shown ? <EyeOff className="size-[18px]" aria-hidden /> : <Eye className="size-[18px]" aria-hidden />}
      </button>
    </div>
  )
}
