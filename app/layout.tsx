import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Cinderella Snipers',
  description: 'Track guards and mid-major bucket-getters who could randomly catch fire in March',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
