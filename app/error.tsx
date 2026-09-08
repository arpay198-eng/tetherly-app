'use client';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6" style={{ background: '#f3f5f7' }}>
      <div className="w-20 h-20 rounded-full flex items-center justify-center mb-6" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)' }}>
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
      </div>
      <h1 className="text-2xl font-bold mb-2" style={{ color: '#1a1a1a' }}>Something went wrong!</h1>
      <p className="text-sm mb-6" style={{ color: '#888' }}>An unexpected error occurred.</p>
      <button
        onClick={() => reset()}
        className="px-6 py-3 rounded-xl text-sm font-semibold text-white"
        style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}
      >
        Try Again
      </button>
    </div>
  );
}
