import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6" style={{ background: '#f3f5f7' }}>
      <div className="w-20 h-20 rounded-full flex items-center justify-center mb-6" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.15)' }}>
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <path d="M16 16s-1.5-2-4-2-4 2-4 2"/>
          <line x1="9" y1="9" x2="9.01" y2="9"/>
          <line x1="15" y1="9" x2="15.01" y2="9"/>
        </svg>
      </div>
      <h1 className="text-2xl font-bold mb-2" style={{ color: '#1a1a1a' }}>404</h1>
      <p className="text-sm mb-6" style={{ color: '#888' }}>Page not found</p>
      <Link href="/dashboard" className="px-6 py-3 rounded-xl text-sm font-semibold" style={{ background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff' }}>
        Go Home
      </Link>
    </div>
  )
}
