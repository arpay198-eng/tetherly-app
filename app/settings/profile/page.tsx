'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/store/useStore';
import MobileNav from '@/components/layout/MobileNav';

export default function ProfilePage() {
  const router = useRouter();
  const { isLoggedIn, user, wallet, logout } = useStore();
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [copiedUid, setCopiedUid] = useState(false);

  useEffect(() => {
    if (!isLoggedIn) router.replace('/auth/login');
  }, [isLoggedIn, router]);

  if (!isLoggedIn || !user) return null;

  const handleLogout = () => {
    logout();
    router.replace('/auth/login');
  };

  const uidNumber = user?.id ? user.id.replace(/\D/g, '') || user.id : '';
  const handleCopyUid = () => {
    navigator.clipboard.writeText(uidNumber);
    setCopiedUid(true);
    setTimeout(() => setCopiedUid(false), 2000);
  };

  const menuItems = [
    {
      label: 'KYC Verification',
      href: '/settings/security',
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
      status: user?.kycStatus === 'verified' ? 'Verified' : 'Pending',
    },
    {
      label: 'Referral Center',
      href: '/referral',
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 15a7 7 0 100-14 7 7 0 000 14z"/><path d="M8.21 13.89L7 23l5-3 5 3-1.21-9.12"/></svg>,
    },
    {
      label: 'Crypto Reward',
      href: '/bonus',
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>,
    },
    {
      label: 'Change Password',
      href: '/settings/security',
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>,
    },
    {
      label: 'Wallet History',
      href: '/transactions',
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 10H2"/></svg>,
    },
    {
      label: 'Payment Methods',
      href: '/withdraw',
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>,
    },
    {
      label: 'Account Details',
      href: '/deposit',
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
    },
    {
      label: 'Notifications',
      href: '/notifications',
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>,
    },
    {
      label: 'Support Tickets',
      href: '/support',
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
    },
  ];

  return (
    <div className="min-h-screen pb-28 px-5 pt-4" style={{ background: '#f3f5f7' }}>

      {/* Top Header Bar with Back button */}
      <div className="flex items-center justify-between py-2 mb-2">
        <button
          onClick={() => router.back()}
          className="w-10 h-10 rounded-xl flex items-center justify-center transition-all active:scale-95 cursor-pointer shadow-sm hover:bg-gray-50"
          style={{ background: '#fff', border: '1px solid #f0f0f0' }}
          aria-label="Back"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <h1 className="text-base font-bold" style={{ color: '#1a1a1a' }}>Profile</h1>
        <div className="w-10" />
      </div>

      <div className="text-center pt-2 pb-6">
        <img
          src="https://randomuser.me/api/portraits/men/32.jpg"
          alt="Profile"
          className="w-[90px] h-[90px] rounded-full mx-auto object-cover"
          style={{ border: '4px solid #f2f2f2' }}
        />
        <div className="text-[28px] font-bold mt-3" style={{ color: '#1a1a1a' }}>{user.name}</div>
        <div className="text-sm mt-1" style={{ color: '#888' }}>{user.email}</div>
        <button
          onClick={handleCopyUid}
          className="inline-flex items-center gap-1.5 mt-2 px-3 py-1.5 rounded-lg text-[13px] font-mono transition-all active:scale-95 cursor-pointer hover:bg-gray-200"
          style={{ background: copiedUid ? '#e8fff1' : '#f0f0f0', color: copiedUid ? '#15b566' : '#666' }}
          title="Click to copy UID"
        >
          <span>UID: {uidNumber}</span>
          {copiedUid ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#15b566" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
          )}
          {copiedUid && <span className="text-[11px] font-sans font-semibold">Copied!</span>}
        </button>
        <div className="mt-4 flex justify-center">
          <div className="inline-flex items-center gap-1.5 px-5 py-2 rounded-full text-[13px] font-semibold" style={{ background: '#e8fff1', color: '#15b566' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            Verified
          </div>
        </div>
      </div>

      {user.email === 'admin@tetherly.com' && (
        <div className="mb-4">
          <button
            onClick={() => router.push('/admin')}
            className="flex items-center justify-between w-full p-4 rounded-2xl transition-all active:scale-[0.98] cursor-pointer"
            style={{
              background: 'linear-gradient(135deg, #10b981 0%, #047857 100%)',
              color: '#fff',
              boxShadow: '0 4px 15px rgba(16, 185, 129, 0.25)',
            }}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.2)' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
              </div>
              <div className="text-left">
                <p className="font-bold text-sm">Admin Control Panel</p>
                <p className="text-[11px] opacity-80">Manage users, withdrawals & platform</p>
              </div>
            </div>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>
      )}

      <div className="rounded-2xl overflow-hidden" style={{ background: '#fff', border: '1px solid #f0f0f0', boxShadow: '0 2px 10px rgba(0,0,0,0.03)' }}>
        {menuItems.map((item, i) => (
          <button
            key={i}
            onClick={() => router.push(item.href)}
            className="flex items-center w-full px-5 py-[18px]"
            style={{ borderBottom: i < menuItems.length - 1 ? '1px solid #f0f0f0' : 'none' }}
          >
            <div className="w-10 text-center shrink-0" style={{ color: '#666' }}>{item.icon}</div>
            <span className="flex-1 text-left text-[15px]" style={{ color: '#333' }}>{item.label}</span>
            {item.status && (
              <span className="text-[13px] font-semibold mr-2" style={{ color: '#18b86a' }}>{item.status}</span>
            )}
            <svg className="shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        ))}
      </div>

      <button
        onClick={() => setShowLogoutModal(true)}
        className="flex items-center w-full rounded-2xl px-5 py-[18px] mt-3"
        style={{ background: '#fff', border: '1px solid #f0f0f0', boxShadow: '0 2px 10px rgba(0,0,0,0.03)' }}
      >
        <div className="w-10 text-center shrink-0" style={{ color: '#ff4d4d' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
        </div>
        <span className="flex-1 text-left text-[15px] font-medium" style={{ color: '#ff4d4d' }}>Logout</span>
      </button>

      {showLogoutModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-6" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="w-full max-w-sm rounded-2xl p-6" style={{ background: '#fff' }}>
            <h3 className="text-base font-bold text-center mb-2" style={{ color: '#1a1a1a' }}>Log out?</h3>
            <p className="text-xs text-center mb-6" style={{ color: '#888' }}>Are you sure you want to log out of your account?</p>
            <div className="flex gap-3">
              <button onClick={() => setShowLogoutModal(false)} className="flex-1 py-3 rounded-xl text-sm font-medium" style={{ background: '#f5f5f5', color: '#666' }}>Cancel</button>
              <button onClick={handleLogout} className="flex-1 py-3 rounded-xl text-sm font-semibold" style={{ background: '#ff4d4d', color: '#fff' }}>Log out</button>
            </div>
          </div>
        </div>
      )}
      <MobileNav />
    </div>
  );
}
