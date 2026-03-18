import type { Metadata } from 'next'
import { Archivo_Narrow, Chivo_Mono } from 'next/font/google'
import './globals.css'

const chivoMono = Chivo_Mono({
  subsets: ['latin'],
  variable: '--font-chivo-mono',
  weight: ['400', '500', '600', '700'],
})

const archivoNarrow = Archivo_Narrow({
  subsets: ['latin'],
  variable: '--font-archivo-narrow',
  weight: ['400', '500', '600', '700'],
})

export const metadata: Metadata = {
  title: 'Cinderella Snipers',
  description:
    'Track guards and mid-major bucket-getters who could randomly catch fire in March',
  icons: {
    icon: [
      { url: '/favicon.ico', type: 'image/x-icon' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: [
      {
        url: '/apple-touch-icon.png',
        sizes: '180x180',
        type: 'image/png',
      },
    ],
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={`${chivoMono.variable} ${archivoNarrow.variable} bg-[#f3f3f3]`}>
        {children}
      </body>
    </html>
  )
}
