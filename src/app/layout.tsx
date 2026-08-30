import type { Metadata, Viewport } from 'next'
import { Caprasimo, Figtree, Noto_Sans_Gujarati } from 'next/font/google'
import './globals.css'
import { LanguageProvider } from '@/lib/i18n/client'
import { getLang } from '@/lib/i18n/server'

// Caprasimo carries the headings, Figtree the body — the pairing the design
// system is built on.
const caprasimo = Caprasimo({
  variable: '--font-caprasimo',
  subsets: ['latin'],
  weight: '400',
})
const figtree = Figtree({
  variable: '--font-figtree',
  subsets: ['latin'],
  weight: ['400', '600', '700'],
})

// Neither Latin face has Gujarati glyphs, so ગુજરાતી needs its own.
const gujarati = Noto_Sans_Gujarati({
  variable: '--font-gujarati',
  subsets: ['gujarati'],
  weight: ['400', '500', '600', '700'],
})

export const metadata: Metadata = {
  title: 'Rojmel',
  description: 'Daily sales, credit customers and billing for a petrol pump',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Rojmel', statusBarStyle: 'default' },
}

export const viewport: Viewport = {
  themeColor: '#c67139',
  width: 'device-width',
  initialScale: 1,
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const lang = await getLang()

  return (
    <html
      lang={lang}
      className={`${caprasimo.variable} ${figtree.variable} ${gujarati.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <LanguageProvider lang={lang}>{children}</LanguageProvider>
      </body>
    </html>
  )
}
