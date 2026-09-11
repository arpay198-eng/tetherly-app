import type { Metadata, Viewport } from 'next'
import { Suspense } from 'react'
import './globals.css'
import FirebaseSync from '@/components/FirebaseSync'

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#f3f5f7',
}

export const metadata: Metadata = {
  title: 'Tetherly - USDT Investment',
  description: 'Secure USDT Investment Platform',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body style={{margin:0, padding:0}}>
        <FirebaseSync />
        <div id="app" className="mx-auto">
          <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 rounded-full border-3 border-emerald-200 border-t-emerald-600 animate-spin" /></div>}>
            {children}
          </Suspense>
        </div>
      </body>
    </html>
  )
}
