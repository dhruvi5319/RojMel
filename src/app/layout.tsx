import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono, Noto_Sans_Gujarati } from 'next/font/google'
import './globals.css'
import { LanguageProvider } from '@/lib/i18n/client'
import { getLang } from '@/lib/i18n/server'

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] })
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] })

// Without a Gujarati face the toggle renders as boxes on most Windows machines.
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
  themeColor: '#0f6b4f',
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
      className={`${geistSans.variable} ${geistMono.variable} ${gujarati.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <LanguageProvider lang={lang}>{children}</LanguageProvider>
      </body>
    </html>
  )
}
