'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useStore } from '@/store/useStore';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export default function RegisterPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [referral, setReferral] = useState(() => {
    if (typeof window === 'undefined') return '';
    return new URLSearchParams(window.location.search).get('ref') || '';
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const register = useStore((s) => s.register);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanName || !cleanEmail || !password) {
      setError('Please fill in all required fields');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);

    try {
      // 1. Verify email uniqueness on Firebase server first
      try {
        const q = query(collection(db, 'users'), where('email', '==', cleanEmail));
        const snap = await getDocs(q);
        if (!snap.empty) {
          setError('Email already registered on server. Please sign in instead.');
          setLoading(false);
          return;
        }
      } catch (err) {
        console.warn('Firebase uniqueness check fallback:', err);
      }

      // Check store fallback
      const allUsers = useStore.getState().allUsers;
      if (allUsers.some((u) => u.email.toLowerCase() === cleanEmail)) {
        setError('Email already registered. Please sign in instead.');
        setLoading(false);
        return;
      }

      // 3. Single server-verified create + session. Throws if the email is
      // already taken (server enforces uniqueness), so the UI shows the real
      // error instead of falsely saying "failed" after the account was created.
      const success = await register(cleanName, cleanEmail, '', password, referral);
      if (success) {
        router.push('/dashboard');
      } else {
        setError('Email already registered. Please sign in instead.');
      }
    } catch (err: any) {
      setError(err?.message || 'Registration failed. Please try again.');
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
                <path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
                <circle cx="8.5" cy="7" r="4" />
                <line x1="20" y1="8" x2="20" y2="14" />
                <line x1="23" y1="11" x2="17" y2="11" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold mb-1" style={{ color: '#1a1a1a' }}>Create account</h1>
            <p className="text-sm" style={{ color: '#888' }}>Start your investment journey</p>
          </div>

          <div className="flex rounded-xl p-1 mb-6" style={{ background: '#f9fafb', border: '1px solid #f0f0f0' }}>
            <Link
              href="/auth/login"
              className="flex-1 py-2.5 rounded-lg text-sm font-medium transition-all text-center"
              style={{ color: '#888' }}
            >
              Sign in
            </Link>
            <div
              className="flex-1 py-2.5 rounded-lg text-sm font-medium transition-all text-center"
              style={{
                background: 'rgba(16,185,129,0.15)',
                color: '#10b981',
                border: '1px solid rgba(16,185,129,0.2)',
              }}
            >
              Create account
            </div>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-xl text-sm" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}>
              {error}
            </div>
          )}

          <form onSubmit={handleRegister} className="flex flex-col gap-3">
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: '#888' }}>Full Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="John Doe"
                className="w-full px-4 py-3 rounded-xl text-sm input-premium"
                style={{ color: '#1a1a1a' }}
              />
            </div>
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
                placeholder="Min 6 characters"
                className="w-full px-4 py-3 rounded-xl text-sm input-premium"
                style={{ color: '#1a1a1a' }}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: '#888' }}>Referral Code <span style={{ color: '#bbb' }}>(optional)</span></label>
              <input
                type="text"
                value={referral}
                onChange={(e) => setReferral(e.target.value)}
                placeholder="e.g. TETH001"
                className="w-full px-4 py-3 rounded-xl text-sm input-premium"
                style={{ color: '#1a1a1a' }}
              />
            </div>
            <button type="submit" disabled={loading} className="w-full py-3.5 rounded-xl text-white font-semibold text-sm mt-2 btn-premium disabled:opacity-50">
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 2v4m0 12v4m-8-10H0m24 0h-4m-2.93-6.07l-2.83 2.83m-8.48 8.48l-2.83 2.83m0-14.14l2.83 2.83m8.48 8.48l2.83 2.83" />
                  </svg>
                  Creating account...
                </span>
              ) : 'Create account'}
            </button>
          </form>

          <p className="text-center mt-6 text-xs" style={{ color: '#aaa' }}>
            Already have an account?{' '}
            <Link href="/auth/login" className="font-medium" style={{ color: '#10b981' }}>Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
