'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useStore } from '@/store/useStore';

export default function LoginPage() {
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const login = useStore((s) => s.login);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password.trim();

    if (!cleanEmail || !cleanPassword) {
      setError('Please fill in all fields');
      return;
    }

    setLoading(true);

    try {
      // Server-verified login via /api/auth (Firestore is the source of truth).
      const success = await login(cleanEmail, cleanPassword);
      if (success) {
        router.push('/dashboard');
      } else {
        setError('Account not found in server database. Please register first.');
      }
    } catch (err: any) {
      setError(err?.message || 'Server verification failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'linear-gradient(180deg, #f3f5f7 0%, #e8e8e8 100%)' }}>
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4 relative" style={{ background: 'linear-gradient(135deg, rgba(16,185,129,0.1), rgba(16,185,129,0.02))', border: '1px solid rgba(16,185,129,0.15)' }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0110 0v4" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold mb-1" style={{ color: '#1a1a1a' }}>Welcome back</h1>
            <p className="text-sm" style={{ color: '#888' }}>Sign in to your Tetherly account</p>
          </div>

          <div className="flex rounded-xl p-1 mb-6" style={{ background: '#f9fafb', border: '1px solid #f0f0f0' }}>
            <button
              onClick={() => setTab('login')}
              className="flex-1 py-2.5 rounded-lg text-sm font-medium transition-all"
              style={{
                background: tab === 'login' ? 'rgba(16,185,129,0.15)' : 'transparent',
                color: tab === 'login' ? '#10b981' : '#888',
                border: tab === 'login' ? '1px solid rgba(16,185,129,0.2)' : '1px solid transparent',
              }}
            >
              Sign in
            </button>
            <Link
              href="/auth/register"
              className="flex-1 py-2.5 rounded-lg text-sm font-medium transition-all text-center"
              style={{ color: '#888' }}
            >
              Create account
            </Link>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-xl text-sm" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}>
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="flex flex-col gap-3">
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: '#888' }}>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-4 py-3 rounded-xl text-sm input-premium"
                style={{ color: '#1a1a1a' }}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: '#888' }}>Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-3 rounded-xl text-sm input-premium"
                style={{ color: '#1a1a1a' }}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-xl text-white font-semibold text-sm mt-2 btn-premium disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  <span>Verifying with server...</span>
                </>
              ) : (
                'Sign in'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
