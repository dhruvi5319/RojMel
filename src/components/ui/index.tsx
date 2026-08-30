import Link from 'next/link'
import type { ComponentProps, ReactNode } from 'react'

/* ------------------------------------------------------------- surfaces -- */

export function Card({
  className = '',
  children,
  ...rest
}: ComponentProps<'div'>) {
  return (
    <div
      className={`rounded-xl border border-border bg-surface ${className}`}
      {...rest}
    >
      {children}
    </div>
  )
}

export function CardHeader({
  title,
  action,
  subtitle,
}: {
  title: ReactNode
  subtitle?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
      <div className="min-w-0">
        <h2 className="truncate text-base font-semibold">{title}</h2>
        {subtitle ? (
          <p className="mt-0.5 text-sm text-muted">{subtitle}</p>
        ) : null}
      </div>
      {action}
    </div>
  )
}

/* ---------------------------------------------------------------- stats -- */

export function Stat({
  label,
  value,
  hint,
  tone = 'plain',
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  tone?: 'plain' | 'brand' | 'accent' | 'danger' | 'ok'
}) {
  const tones = {
    plain: 'bg-surface border-border',
    brand: 'bg-brand-soft border-brand/25',
    accent: 'bg-accent-soft border-accent/30',
    danger: 'bg-danger-soft border-danger/30',
    ok: 'bg-ok-soft border-ok/30',
  } as const
  return (
    <div className={`rounded-xl border p-4 ${tones[tone]}`}>
      <div className="text-sm font-medium text-muted">{label}</div>
      <div className="tabular mt-1 text-2xl font-semibold tracking-tight sm:text-[1.75rem]">
        {value}
      </div>
      {hint ? <div className="mt-1 text-sm text-muted">{hint}</div> : null}
    </div>
  )
}

/* --------------------------------------------------------------- inputs -- */

const controlBase =
  'w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-[15px] ' +
  'outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/25 ' +
  'disabled:opacity-60 disabled:cursor-not-allowed'

export function Field({
  label,
  hint,
  error,
  required,
  children,
}: {
  label: string
  hint?: string
  error?: string | null
  required?: boolean
  children: ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">
        {label}
        {required ? <span className="text-danger"> *</span> : null}
      </span>
      {children}
      {error ? (
        <span className="mt-1 block text-sm text-danger">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-sm text-muted">{hint}</span>
      ) : null}
    </label>
  )
}

export function Input({ className = '', ...rest }: ComponentProps<'input'>) {
  return <input className={`${controlBase} ${className}`} {...rest} />
}

/** Numbers at the pump are entered on a phone keypad. */
export function NumberInput({ className = '', ...rest }: ComponentProps<'input'>) {
  return (
    <input
      type="number"
      inputMode="decimal"
      className={`${controlBase} tabular text-right ${className}`}
      {...rest}
    />
  )
}

export function Select({ className = '', ...rest }: ComponentProps<'select'>) {
  return <select className={`${controlBase} ${className}`} {...rest} />
}

export function Textarea({ className = '', ...rest }: ComponentProps<'textarea'>) {
  return <textarea rows={3} className={`${controlBase} ${className}`} {...rest} />
}

/* -------------------------------------------------------------- buttons -- */

const variants = {
  primary: 'bg-brand text-white hover:bg-brand-strong border-transparent',
  secondary: 'bg-surface hover:bg-surface-2 border-border',
  danger: 'bg-danger text-white hover:opacity-90 border-transparent',
  ghost: 'bg-transparent hover:bg-surface-2 border-transparent',
} as const

const sizes = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2.5 text-[15px]',
  lg: 'px-5 py-3 text-base',
} as const

type BtnLook = { variant?: keyof typeof variants; size?: keyof typeof sizes }

function look({ variant = 'primary', size = 'md' }: BtnLook) {
  return (
    'inline-flex items-center justify-center gap-2 rounded-lg border font-medium ' +
    'transition disabled:opacity-50 disabled:cursor-not-allowed ' +
    `${variants[variant]} ${sizes[size]}`
  )
}

export function Button({
  variant,
  size,
  className = '',
  ...rest
}: ComponentProps<'button'> & BtnLook) {
  return <button className={`${look({ variant, size })} ${className}`} {...rest} />
}

export function LinkButton({
  variant,
  size,
  className = '',
  ...rest
}: ComponentProps<typeof Link> & BtnLook) {
  return <Link className={`${look({ variant, size })} ${className}`} {...rest} />
}

/* --------------------------------------------------------------- badges -- */

export function Badge({
  tone = 'neutral',
  children,
}: {
  tone?: 'neutral' | 'brand' | 'ok' | 'accent' | 'danger'
  children: ReactNode
}) {
  const tones = {
    neutral: 'bg-surface-2 text-muted border-border',
    brand: 'bg-brand-soft text-brand border-brand/25',
    ok: 'bg-ok-soft text-ok border-ok/30',
    accent: 'bg-accent-soft text-accent border-accent/30',
    danger: 'bg-danger-soft text-danger border-danger/30',
  } as const
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${tones[tone]}`}
    >
      {children}
    </span>
  )
}

/* ---------------------------------------------------------------- table -- */

/** Wide tables scroll inside themselves; the page never scrolls sideways. */
export function TableWrap({ children }: { children: ReactNode }) {
  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full min-w-full border-collapse text-[15px]">
        {children}
      </table>
    </div>
  )
}

export function Th({ className = '', ...rest }: ComponentProps<'th'>) {
  return (
    <th
      className={`border-b border-border px-4 py-2.5 text-left text-sm font-semibold text-muted whitespace-nowrap ${className}`}
      {...rest}
    />
  )
}

export function Td({ className = '', ...rest }: ComponentProps<'td'>) {
  return (
    <td
      className={`border-b border-border px-4 py-3 align-middle ${className}`}
      {...rest}
    />
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="px-4 py-10 text-center text-muted">{children}</div>
  )
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: ReactNode
  subtitle?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle ? <p className="mt-1 text-muted">{subtitle}</p> : null}
      </div>
      {action ? <div className="no-print flex gap-2">{action}</div> : null}
    </div>
  )
}

export function Alert({
  tone = 'accent',
  children,
}: {
  tone?: 'accent' | 'danger' | 'ok' | 'brand'
  children: ReactNode
}) {
  const tones = {
    accent: 'bg-accent-soft border-accent/30 text-accent',
    danger: 'bg-danger-soft border-danger/30 text-danger',
    ok: 'bg-ok-soft border-ok/30 text-ok',
    brand: 'bg-brand-soft border-brand/25 text-brand',
  } as const
  return (
    <div className={`rounded-lg border px-4 py-3 text-[15px] ${tones[tone]}`}>
      {children}
    </div>
  )
}
