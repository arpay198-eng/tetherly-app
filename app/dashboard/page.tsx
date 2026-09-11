'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useStore } from '@/store/useStore';
import MobileNav from '@/components/layout/MobileNav';

export default function DashboardPage() {
  const router = useRouter();
  const isLoggedIn = useStore((s) => s.isLoggedIn);
  const wallet = useStore((s) => s.wallet);
  const user = useStore((s) => s.user);
  const lastDepositDate = useStore((s) => s.lastDepositDate);
  const lastDepositAmount = useStore((s) => s.lastDepositAmount);
  const bonusClaimed = useStore((s) => s.bonusClaimed);
  const pendingClaims = useStore((s) => s.pendingClaims);
  const lastBonusGeneratedAt = useStore((s) => s.lastBonusGeneratedAt);
  const transactions = useStore((s) => s.transactions);
  const claimBonus = useStore((s) => s.claimBonus);
  const notifications = useStore((s) => s.notifications);
  const loadNotifications = useStore((s) => s.loadNotifications);
  const refreshUser = useStore((s) => s.refreshUser);
  const [countdown, setCountdown] = useState({ h: 0, m: 0, s: 0 });
  const [serverTx, setServerTx] = useState<any[]>([]);
  const [activeBanner, setActiveBanner] = useState(0);

  // Auto-slide banner
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveBanner((prev) => (prev + 1) % 3);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const getRemaining = useCallback(() => {
    if (!lastDepositDate || lastDepositAmount <= 0) return 0;
    if ((wallet.depositBalance ?? 0) <= 0) return 0;
    // If there are pending claims, countdown is 0 (can claim now)
    if (pendingClaims > 0) return 0;
    // Calculate next claim time
    let claimStartAt: number;
    if (lastBonusGeneratedAt) {
      claimStartAt = new Date(lastBonusGeneratedAt).getTime() + 24 * 60 * 60 * 1000;
    } else {
      claimStartAt = new Date(lastDepositDate).getTime() + 24 * 60 * 60 * 1000;
    }
    return Math.max(0, claimStartAt - Date.now());
  }, [lastDepositDate, lastDepositAmount, pendingClaims, lastBonusGeneratedAt, wallet.depositBalance]);

  useEffect(() => {
    if (!isLoggedIn) { router.replace('/auth/login'); return; }

    const updateCountdown = () => {
      const diff = getRemaining();
      setCountdown({
        h: Math.floor(diff / 3600000),
        m: Math.floor((diff % 3600000) / 60000),
        s: Math.floor((diff % 60000) / 1000),
      });
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    void loadNotifications();
    void refreshUser();
    return () => clearInterval(interval);
  }, [isLoggedIn, router, getRemaining, loadNotifications, refreshUser]);

  if (!isLoggedIn) return null;

  // Instant render from cache - update in background
  const hasDeposit = !!lastDepositDate && lastDepositAmount > 0 && wallet.depositBalance > 0;
  const bonusPerClaim = hasDeposit ? Math.round(wallet.depositBalance * 0.04 * 100) / 100 : 0;
  const totalPendingBonus = Math.round(bonusPerClaim * pendingClaims * 100) / 100;
  const canClaim = hasDeposit && pendingClaims > 0;
  const recentTx = transactions.length > 0 ? transactions.slice(0, 5) : serverTx.slice(0, 5);

  const formatAmount = (n: number) => {
    const abs = Math.abs(n);
    return abs.toLocaleString('en-US');
  };

  const getTxIcon = (type: string) => {
    switch (type) {
      case 'deposit':
        return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1v22"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>;
      case 'withdrawal':
        return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>;
      case 'bonus':
        return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>;
      case 'referral':
        return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>;
      default:
        return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return '#10b981';
      case 'pending': return '#f59e0b';
      case 'failed': return '#ef4444';
      default: return '#6b7280';
    }
  };

  return (
    <div className="min-h-screen pb-28" style={{ background: '#ffffff' }}>
      <div className="fixed top-0 left-1/2 -translate-x-1/2 z-40 w-full max-w-[440px] px-5 pt-4 pb-3" style={{ background: 'rgba(255,255,255,0.96)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs mb-1" style={{ color: '#999' }}>Welcome back,</p>
            <h1 className="text-lg font-bold" style={{ color: '#1a1a1a' }}>{user?.name || 'User'}</h1>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/notifications" className="relative w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: '#fff', border: '1px solid #f0f0f0' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 01-3.46 0" />
              </svg>
              {notifications.filter((n) => !n.read).length > 0 && (
                <span className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full" style={{ background: '#ef4444', border: '2px solid #fff' }} />
              )}
            </Link>
          </div>
        </div>
      </div>

      <div className="px-5 pt-20 pb-6">

        {/* My Total Assets */}
        <div className="mb-5">
          <p className="text-xs mb-1" style={{ color: '#999' }}>My total assets</p>
          <p className="text-2xl font-black tabular-nums" style={{ color: '#1a1a1a' }}>${formatAmount((wallet.depositBalance || 0) + (wallet.bonusBalance || 0))}</p>
        </div>

        {/* Auto-slide Banner */}
        <div className="relative mb-5 overflow-hidden rounded-2xl" style={{ height: '180px' }}>
          <div 
            className="flex transition-transform duration-500 ease-in-out h-full"
            style={{ transform: `translateX(-${activeBanner * 100}%)` }}
          >
            {/* Slide 1: Referral */}
            <div className="min-w-full h-full p-5 flex flex-col justify-center relative" style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
              <h3 className="text-lg font-black text-white mb-1 uppercase">Invite & Earn</h3>
              <p className="text-xs text-white/70 mb-1">Level 1: 0.75% daily on direct referrals</p>
              <p className="text-xs text-white/70 mb-3">Level 2: 0.25% daily on indirect referrals</p>
              <div className="flex items-center gap-2">
                <span className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white/20 text-white cursor-pointer">NEXT OFFER →</span>
              </div>
              <div className="absolute right-5 top-1/2 -translate-y-1/2 opacity-20">
                <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5"><path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
              </div>
            </div>

            {/* Slide 2: Deposit Bonus */}
            <div className="min-w-full h-full p-5 flex flex-col justify-center relative" style={{ background: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)' }}>
              <h3 className="text-lg font-black text-white mb-1 uppercase">4% Bonus on Every Deposit</h3>
              <p className="text-xs text-white/70 mb-3">Claim after 24 hours to your bonus wallet</p>
              <div className="flex items-center gap-2">
                <span className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white/20 text-white cursor-pointer">NEXT OFFER →</span>
              </div>
              <div className="absolute right-5 top-1/2 -translate-y-1/2 opacity-20">
                <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><path d="M16 8h-6a2 2 0 100 4h4a2 2 0 010 4H8"/><path d="M12 18V6"/></svg>
              </div>
            </div>

            {/* Slide 3: How Earnings Work */}
            <div className="min-w-full h-full p-5 flex flex-col justify-center relative" style={{ background: 'linear-gradient(135deg, #5b5fc7 0%, #6c5ce7 100%)' }}>
              <h3 className="text-base font-black text-white mb-1 uppercase">How Your Earnings Work</h3>
              <p className="text-[11px] text-white/70 mb-3 leading-relaxed">We partner with a licensed investment firm that trades daily. Your funds are securely managed & profits are shared directly to your wallet every day. 100% transparent.</p>
              <div className="flex items-center gap-2">
                <span className="px-3 py-1.5 rounded-lg text-xs font-bold bg-white/20 text-white cursor-pointer">LEARN MORE →</span>
              </div>
            </div>
          </div>

          {/* Dots */}
          <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5">
            {[0, 1, 2].map((i) => (
              <div 
                key={i} 
                className="rounded-full transition-all duration-300"
                style={{ 
                  width: activeBanner === i ? '16px' : '6px', 
                  height: '6px',
                  background: activeBanner === i ? '#fff' : 'rgba(255,255,255,0.4)'
                }} 
              />
            ))}
          </div>
        </div>

        <div className="flex gap-3 mb-5">
          <Link href="/deposit" className="flex-1 py-3 rounded-xl text-white text-sm font-semibold text-center btn-premium">
            Deposit
          </Link>
          <Link href="/withdraw" className="flex-1 py-3 rounded-xl text-sm font-semibold text-center" style={{ background: '#fff', border: '1px solid #e5e7eb', color: '#555' }}>
            Withdraw
          </Link>
        </div>

        {/* ── Daily Bonus Card ── */}
        <div className="rounded-2xl mb-5 overflow-hidden" style={{ background: '#fff', border: '1px solid #ede9fe', boxShadow: '0 2px 16px rgba(139,92,246,0.08)' }}>
          {/* Top accent bar */}
          <div style={{ height: 3, background: 'linear-gradient(90deg, #8b5cf6, #a78bfa, #c4b5fd)' }} />

          <div className="p-4">
            {/* Header row */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: '#f5f3ff' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-bold" style={{ color: '#1a1a1a' }}>Daily Bonus</p>
                  <p className="text-[10px]" style={{ color: '#8b5cf6' }}>4% of deposit balance</p>
                </div>
              </div>
              {/* Status pill */}
              {pendingClaims > 0 ? (
                <span className="flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full" style={{ background: '#dcfce7', color: '#16a34a' }}>
                  <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: '#16a34a' }} />
                  {pendingClaims} Ready
                </span>
              ) : hasDeposit ? (
                <span className="flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full" style={{ background: '#dcfce7', color: '#16a34a' }}>
                  <span className="blink-dot w-1.5 h-1.5 rounded-full inline-block" style={{ background: '#16a34a' }} />
                  Waiting
                </span>
              ) : null}
            </div>

            {hasDeposit ? (
              <>
                {/* Stats — 3 chips in one row */}
                <div className="grid grid-cols-3 gap-2 mb-4">
                  {[
                    { label: 'Pending', val: `$${formatAmount(totalPendingBonus)}`, accent: true },
                    { label: 'Per Claim', val: `$${formatAmount(bonusPerClaim)}`, accent: false },
                    { label: 'Deposit', val: `$${formatAmount(wallet.depositBalance)}`, accent: false },
                  ].map((s) => (
                    <div key={s.label} className="rounded-xl p-2.5 text-center" style={{ background: '#faf8ff', border: `1px solid ${s.accent ? '#ede9fe' : '#f3f4f6'}` }}>
                      <p className="text-[9px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: '#9ca3af' }}>{s.label}</p>
                      <p className="text-sm font-black tabular-nums" style={{ color: s.accent ? '#7c3aed' : '#1a1a1a' }}>{s.val}</p>
                    </div>
                  ))}
                </div>

                {/* Countdown — compact inline, only when waiting */}
                {pendingClaims === 0 && (
                  <div className="flex items-center justify-center gap-1.5 mb-4 py-3 rounded-xl" style={{ background: '#faf8ff', border: '1px solid #ede9fe' }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="mr-1">
                      <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                    </svg>
                    <span className="text-sm font-black tabular-nums" style={{ color: '#1a1a1a' }}>
                      {String(countdown.h).padStart(2, '0')}
                      <span style={{ color: '#8b5cf6', margin: '0 2px' }}>:</span>
                      {String(countdown.m).padStart(2, '0')}
                      <span style={{ color: '#8b5cf6', margin: '0 2px' }}>:</span>
                      {String(countdown.s).padStart(2, '0')}
                    </span>
                    <span className="text-[10px] font-semibold ml-1" style={{ color: '#9ca3af' }}>until next claim</span>
                  </div>
                )}

                {/* CTA Button */}
                <button
                  onClick={canClaim ? () => { claimBonus().catch(console.error); } : undefined}
                  disabled={!canClaim}
                  className="w-full py-3 rounded-xl text-sm font-bold transition-all active:scale-[0.98]"
                  style={canClaim ? {
                    background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
                    color: '#fff',
                    boxShadow: '0 4px 16px rgba(124,58,237,0.3)',
                  } : {
                    background: '#f9fafb',
                    color: '#9ca3af',
                    border: '1px solid #f3f4f6',
                  }}
                >
                  {canClaim
                    ? `Claim $${formatAmount(totalPendingBonus > 0 ? totalPendingBonus : bonusPerClaim)}${pendingClaims > 1 ? ` · ${pendingClaims} claims` : ''}`
                    : 'Claim Bonus'
                  }
                </button>
              </>
            ) : (
              <>
                <p className="text-xs mb-3" style={{ color: '#9ca3af' }}>Deposit to unlock 4% daily bonus on your balance.</p>
                <button
                  onClick={() => router.push('/deposit')}
                  className="w-full py-3 rounded-xl text-sm font-bold text-white transition-all active:scale-[0.98]"
                  style={{ background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)', boxShadow: '0 4px 16px rgba(124,58,237,0.25)' }}
                >
                  Make a Deposit
                </button>
              </>
            )}
          </div>
        </div>

        <div className="rounded-2xl p-4 card-premium">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold" style={{ color: '#1a1a1a' }}>Recent Activity</span>
            <Link href="/transactions" className="text-xs font-medium" style={{ color: '#10b981' }}>View all</Link>
          </div>
          {recentTx.length === 0 ? (
            <p className="text-xs text-center py-6" style={{ color: '#bbb' }}>No transactions yet</p>
          ) : (
            <div className="flex flex-col gap-2">
              {recentTx.map((tx) => (
                <div key={tx.id} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: '#fff' }}>
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: '#f9fafb' }}>
                    {getTxIcon(tx.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate" style={{ color: '#1a1a1a' }}>{tx.type.charAt(0).toUpperCase() + tx.type.slice(1)}</p>
                    <p className="text-[10px] font-medium" style={{ color: '#999' }}>{new Date(tx.date).toLocaleDateString()}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-semibold tabular-nums" style={{ color: tx.amount >= 0 ? '#10b981' : '#f87171' }}>
                      {tx.amount >= 0 ? '+' : ''}{Math.abs(tx.amount).toLocaleString('en-US')}
                    </p>
                    <p className="text-[10px] font-bold capitalize" style={{ color: getStatusColor(tx.status) }}>{tx.status}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <MobileNav />
    </div>
  );
}
