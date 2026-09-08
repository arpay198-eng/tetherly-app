'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useStore } from '@/store/useStore';

export default function SplashPage() {
  const [show, setShow] = useState(false);
  const [fading, setFading] = useState(false);
  const router = useRouter();
  const isLoggedIn = useStore((s) => s.isLoggedIn);

  useEffect(() => {
    if (isLoggedIn) {
      router.replace('/dashboard');
      return;
    }
    const t1 = setTimeout(() => setFading(true), 1800);
    const t2 = setTimeout(() => setShow(true), 2400);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [isLoggedIn, router]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden" style={{ background: 'linear-gradient(180deg, #f3f5f7 0%, #e8e8e8 50%, #f3f5f7 100%)' }}>
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full" style={{ background: 'radial-gradient(circle, rgba(16,185,129,0.08) 0%, transparent 70%)' }} />
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] rounded-full" style={{ background: 'radial-gradient(circle, rgba(16,185,129,0.05) 0%, transparent 70%)' }} />
      </div>

      <div className={`flex flex-col items-center transition-all duration-1000 ${fading ? 'opacity-0 scale-95' : 'opacity-100 scale-100'}`}>
        <div className="mb-6 relative">
          <svg width="80" height="80" viewBox="0 0 80 80" fill="none">
            <rect x="4" y="4" width="72" height="72" rx="18" fill="url(#logoGrad)" stroke="rgba(16,185,129,0.3)" strokeWidth="1" />
            <path d="M40 18C30.06 18 22 26.06 22 36C22 42.5 26.5 48 32.5 50.5V58C32.5 59.1 33.4 60 34.5 60H45.5C46.6 60 47.5 59.1 47.5 58V50.5C53.5 48 58 42.5 58 36C58 26.06 49.94 18 40 18ZM40 45C35.58 45 32 41.42 32 37C32 32.58 35.58 29 40 29C44.42 29 48 32.58 48 37C48 41.42 44.42 45 40 45Z" fill="rgba(16,185,129,0.9)" />
            <defs>
              <linearGradient id="logoGrad" x1="0" y1="0" x2="80" y2="80">
                <stop stopColor="#0a1a10" />
                <stop offset="1" stopColor="#f3f5f7" />
              </linearGradient>
            </defs>
          </svg>
          <div className="absolute inset-0 rounded-full" style={{ filter: 'blur(20px)', background: 'rgba(16,185,129,0.2)' }} />
        </div>
        <h1 className="text-3xl font-bold tracking-tight mb-2">
          <span style={{ color: '#10b981' }}>Tether</span>
          <span className="text-white">ly</span>
        </h1>
        <p className="text-sm" style={{ color: '#888' }}>Secure USDT Investment Platform</p>
      </div>

      {show && (
        <div className="absolute bottom-0 left-0 right-0 p-8 pb-12 flex flex-col gap-3 animate-fadeIn" style={{ animation: 'fadeInUp 0.6s ease forwards' }}>
          <Link href="/auth/login" className="w-full py-4 rounded-xl text-center text-white font-semibold text-base btn-premium block">
            Sign in
          </Link>
          <Link href="/auth/register" className="w-full py-4 rounded-xl text-center font-semibold text-base block" style={{ background: '#fff', border: '1px solid #e5e7eb', color: '#555' }}>
            Create account
          </Link>
        </div>
      )}

      <style jsx>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
