'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/store/useStore';
import { apiPost, setAuthToken } from '@/lib/firebaseService';
import MobileNav from '@/components/layout/MobileNav';

export default function SecurityPage() {
  const router = useRouter();
  const isLoggedIn = useStore((s) => s.isLoggedIn);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordEnabled, setPasswordEnabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isLoggedIn) router.replace('/auth/login');
  }, [isLoggedIn, router]);

  if (!isLoggedIn) return null;

  const loginHistory = [
    { date: '2026-09-06 14:32', ip: '192.168.1.***', device: 'Chrome / Windows', location: 'New York, US', current: true },
    { date: '2026-09-05 09:15', ip: '192.168.1.***', device: 'Safari / iPhone', location: 'New York, US', current: false },
    { date: '2026-09-03 18:45', ip: '10.0.0.***', device: 'Firefox / macOS', location: 'New York, US', current: false },
  ];

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccess('');
    setError('');

    if (!currentPassword || !newPassword || !confirmPassword) {
      setError('All fields are required');
      return;
    }
    if (newPassword.length < 6) {
      setError('New password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }
    if (newPassword === currentPassword) {
      setError('New password must be different from the current password');
      return;
    }

    setLoading(true);
    try {
      const res = await apiPost('/auth', { action: 'changePassword', currentPassword, newPassword });
      // Rotate token and update local user so only the new credential stays valid.
      if (res?.token) setAuthToken(res.token);

      setShowPasswordModal(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSuccess('Password updated successfully');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err?.message || 'Failed to update password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen pb-28" style={{ background: '#f3f5f7' }}>
      <div className="px-5 pt-5 pb-6">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => router.back()} className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: '#fff', border: '1px solid #f0f0f0' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <h1 className="text-xl font-bold" style={{ color: '#1a1a1a' }}>Security</h1>
        </div>

        {success && (
          <div className="mb-4 p-3 rounded-xl text-sm flex items-center gap-2" style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', color: '#10b981' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            {success}
          </div>
        )}

        <div className="rounded-2xl overflow-hidden card-premium mb-5">
          <div className="p-4 flex items-center gap-3" style={{ borderBottom: '1px solid #f0f0f0' }}>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(16,185,129,0.1)' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium" style={{ color: '#1a1a1a' }}>Password</p>
              <p className="text-[10px]" style={{ color: '#999' }}>{passwordEnabled ? 'Set and active' : 'Not configured'}</p>
            </div>
            <button onClick={() => setShowPasswordModal(true)} className="px-3 py-1.5 rounded-lg text-xs font-medium" style={{ background: '#f9fafb', color: '#888', border: '1px solid #f0f0f0' }}>
              Change
            </button>
          </div>

        </div>

        <h3 className="text-sm font-semibold mb-3" style={{ color: '#1a1a1a' }}>Login History</h3>
        <div className="rounded-2xl overflow-hidden card-premium">
          {loginHistory.map((login, i) => (
            <div key={i} className="p-4" style={{ borderBottom: i < loginHistory.length - 1 ? '1px solid #f0f0f0' : 'none' }}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium" style={{ color: '#1a1a1a' }}>{login.device}</span>
                {login.current && <span className="text-[9px] px-1.5 py-0.5 rounded badge-premium">Current</span>}
              </div>
              <p className="text-[10px] mb-1" style={{ color: '#999' }}>{login.date} · {login.ip}</p>
              <p className="text-[10px]" style={{ color: '#bbb' }}>{login.location}</p>
            </div>
          ))}
        </div>
      </div>

      {showPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-6" style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)' }}>
          <div className="w-full max-w-sm rounded-2xl p-6" style={{ background: '#ffffff', border: '1px solid #e5e7eb' }}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-bold" style={{ color: '#1a1a1a' }}>Change Password</h3>
              <button onClick={() => setShowPasswordModal(false)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <form onSubmit={handleChangePassword} className="flex flex-col gap-3">
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: '#888' }}>Current Password</label>
                <input type="password" value={currentPassword} onChange={(e) => { setCurrentPassword(e.target.value); setError(''); }} className="w-full px-4 py-3 rounded-xl text-sm input-premium" style={{ color: '#1a1a1a' }} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: '#888' }}>New Password</label>
                <input type="password" value={newPassword} onChange={(e) => { setNewPassword(e.target.value); setError(''); }} className="w-full px-4 py-3 rounded-xl text-sm input-premium" style={{ color: '#1a1a1a' }} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: '#888' }}>Confirm Password</label>
                <input type="password" value={confirmPassword} onChange={(e) => { setConfirmPassword(e.target.value); setError(''); }} className="w-full px-4 py-3 rounded-xl text-sm input-premium" style={{ color: '#1a1a1a' }} />
              </div>
              {error && (
                <p className="text-xs px-3 py-2 rounded-lg" style={{ background: 'rgba(239,68,68,0.08)', color: '#f87171' }}>{error}</p>
              )}
              <div className="flex gap-3 mt-1">
                <button type="button" onClick={() => setShowPasswordModal(false)} disabled={loading} className="flex-1 py-3 rounded-xl text-sm font-medium" style={{ background: '#f9fafb', color: '#888', border: '1px solid #f0f0f0' }}>Cancel</button>
                <button type="submit" disabled={loading} className="flex-1 py-3 rounded-xl text-sm font-semibold btn-premium text-white disabled:opacity-60">{loading ? 'Updating…' : 'Update'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
      <MobileNav />
    </div>
  );
}
