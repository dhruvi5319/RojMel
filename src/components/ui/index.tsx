import Link from 'next/link'
import type { ComponentProps, ReactNode } from 'react'

/* ═══════════════════════════════════════════════════════════════════════════
   Primitives mirroring the Claude Design "organic" system: pill controls,
   deeply rounded cards on a warm ground, uppercase table headings, and
   Caprasimo on anything that behaves like a title.
   ═══════════════════════════════════════════════════════════════════════ */

/* ------------------------------------------------------------- surfaces -- */

export function Card({ className = '', children, ...rest }: ComponentProps<'div'>) {
  return (
    <div
      className={`rounded-[var(--radius-card)] bg-surface ${className}`}
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
    <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3">
      <div className="min-w-0">
        <h2 className="truncate text-[17px] leading-tight">{title}</h2>
        {subtitle ? (
          <p className="mt-1 text-[13px] text-neutral-600">{subtitle}</p>
        ) : null}
      </div>
      {action}
    </div>
  )
}

/** The small uppercase label above a group, from the design's section heads. */
export function Kicker({ children }: { children: ReactNode }) {
  return (
    <div className="text-[11px] font-semibold tracking-[0.1em] text-neutral-600 uppercase">
      {children}
    </div>
  )
}

/** Marks something the mockups propose that the pump has not agreed to yet. */
export function Proposal() {
  return (
    <span className="inline-flex items-center rounded-full bg-accent-2-200 px-2 py-0.5 text-[9.5px] font-semibold tracking-[0.09em] text-accent-2-900 uppercase">
      Proposal
    </span>
  )
}

/* ---------------------------------------------------------------- stats -- */

export function Stat({
  label,
  value,
  hint,
  tone = 'plain',
  prefix,
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  tone?: 'plain' | 'accent' | 'ok' | 'danger'
  /** The − and = that turn the four tiles into one sum. */
  prefix?: string
}) {
  const tones = {
    plain: 'bg-surface',
    accent: 'bg-accent-200',
    ok: 'bg-accent-2-200',
    danger: 'bg-danger-100',
  } as const
  return (
    <div className={`relative min-w-0 rounded-[var(--radius-card)] px-4 py-4 ${tones[tone]}`}>
      {prefix ? (
        <span className="absolute -left-3 top-1/2 hidden -translate-y-1/2 text-lg text-neutral-500 lg:block">
          {prefix}
        </span>
      ) : null}
      <div className="text-[12px] font-semibold tracking-[0.06em] text-neutral-600 uppercase">
        {label}
      </div>
      <div className="tabular mt-1.5 font-[family-name:var(--font-heading)] text-[clamp(18px,1.9vw,26px)] leading-tight">
        {value}
      </div>
      {hint ? (
        <div className="tabular mt-1.5 text-[12.5px] text-neutral-600">{hint}</div>
      ) : null}
    </div>
  )
}

/* --------------------------------------------------------------- inputs -- */

const controlBase =
  'w-full min-h-[42px] rounded-full border border-divider bg-bg px-4 py-2 text-[15px] ' +
  'outline-none transition hover:border-neutral-500 focus-visible:border-accent ' +
  'disabled:opacity-50 disabled:cursor-not-allowed'

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
      <span className="mb-1.5 block text-[12.5px] font-semibold text-neutral-700">
        {label}
        {required ? <span className="text-accent"> *</span> : null}
      </span>
      {children}
      {error ? (
        <span className="mt-1.5 block text-[12.5px] text-danger">{error}</span>
      ) : hint ? (
        <span className="mt-1.5 block text-[12.5px] text-neutral-600">{hint}</span>
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
  return (
    <textarea
      rows={3}
      className={`${controlBase} min-h-[90px] resize-y rounded-[22px] ${className}`}
      {...rest}
    />
  )
}

/* -------------------------------------------------------------- buttons -- */

const variants = {
  primary: 'bg-accent text-bg hover:bg-accent-600 active:bg-accent-700 border-transparent',
  secondary:
    'border-divider hover:bg-[color-mix(in_srgb,var(--color-text)_7%,transparent)] ' +
    'active:bg-[color-mix(in_srgb,var(--color-text)_14%,transparent)]',
  danger: 'bg-danger text-bg hover:opacity-90 border-transparent',
  ghost: 'border-transparent text-accent hover:bg-accent-100',
} as const

const sizes = {
  sm: 'px-3.5 py-2 text-[13px]',
  md: 'px-4 py-2.5 text-[14px]',
  lg: 'px-5 py-3 text-[15px]',
} as const

type BtnLook = { variant?: keyof typeof variants; size?: keyof typeof sizes }

function look({ variant = 'primary', size = 'md' }: BtnLook) {
  return (
    'inline-flex items-center justify-center gap-2 rounded-full border ' +
    'font-[family-name:var(--font-heading)] leading-tight cursor-pointer ' +
    'transition disabled:opacity-45 disabled:cursor-not-allowed ' +
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

/* ---------------------------------------------------------------- tags --- */

export function Badge({
  tone = 'neutral',
  children,
}: {
  tone?: 'neutral' | 'accent' | 'ok' | 'danger' | 'outline'
  children: ReactNode
}) {
  const tones = {
    neutral: 'bg-neutral-200 text-neutral-800',
    accent: 'bg-accent-100 text-accent-800',
    ok: 'bg-accent-2-100 text-accent-2-800',
    danger: 'bg-danger-100 text-danger',
    outline: 'border border-accent text-accent',
  } as const
  return (
    <span
      className={`inline-flex items-center rounded-xl px-2.5 py-[3px] text-[11px] whitespace-nowrap ${tones[tone]}`}
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
      <table className="w-full border-collapse text-[14px]">{children}</table>
    </div>
  )
}

export function Th({ className = '', ...rest }: ComponentProps<'th'>) {
  return (
    <th
      className={`border-b border-divider px-3 py-2 text-left text-[11px] font-semibold tracking-[0.08em] text-neutral-600 uppercase whitespace-nowrap ${className}`}
      {...rest}
    />
  )
}

export function Td({ className = '', ...rest }: ComponentProps<'td'>) {
  return (
    <td
      className={`border-b border-[color-mix(in_srgb,var(--color-text)_8%,transparent)] px-3 py-2.5 align-middle ${className}`}
      {...rest}
    />
  )
}

/** Table body rows lift slightly on hover, as in the mockups. */
export const rowClass =
  'hover:bg-[color-mix(in_srgb,var(--color-text)_4%,transparent)]'

export function Empty({ children }: { children: ReactNode }) {
  return <div className="px-4 py-10 text-center text-neutral-600">{children}</div>
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
        <h1 className="text-[28px] leading-tight">{title}</h1>
        {subtitle ? (
          <p className="mt-1 text-[13px] text-neutral-600">{subtitle}</p>
        ) : null}
      </div>
      {action ? <div className="no-print flex flex-wrap gap-2">{action}</div> : null}
    </div>
  )
}

export function Alert({
  tone = 'accent',
  children,
}: {
  tone?: 'accent' | 'danger' | 'ok' | 'neutral'
  children: ReactNode
}) {
  const tones = {
    accent: 'bg-accent-100 text-accent-800',
    danger: 'bg-danger-100 text-danger',
    ok: 'bg-accent-2-100 text-accent-2-800',
    neutral: 'bg-neutral-200 text-neutral-800',
  } as const
  return (
    <div className={`rounded-[22px] px-4 py-3 text-[14px] ${tones[tone]}`}>
      {children}
    </div>
  )
}
