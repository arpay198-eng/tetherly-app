'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useStore } from '@/store/useStore';
import { apiGet } from '@/lib/firebaseService';
import MobileNav from '@/components/layout/MobileNav';

export default function DashboardPage() {
  const router = useRouter();
  const { isLoggedIn, wallet, user, lastDepositDate, lastDepositAmount, bonusClaimed, transactions, claimBonus, notifications, loadNotifications, refreshUser } = useStore();
  const [countdown, setCountdown] = useState({ h: 0, m: 0, s: 0 });
  const [serverTx, setServerTx] = useState<any[]>([]);

  const getRemaining = useCallback(() => {
    if (!lastDepositDate || lastDepositAmount <= 0 || bonusClaimed) return 0;
    if ((wallet.depositBalance ?? 0) <= 0) return 0;
    const claimableAt = new Date(lastDepositDate).getTime() + 24 * 60 * 60 * 1000;
    return Math.max(0, claimableAt - Date.now());
  }, [lastDepositDate, lastDepositAmount, bonusClaimed, wallet.depositBalance]);

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

  const hasDeposit = !!lastDepositDate && lastDepositAmount > 0 && wallet.depositBalance > 0;
  const bonusAmount = hasDeposit ? wallet.depositBalance * 0.04 : 0;
  const canClaim = hasDeposit && !bonusClaimed && getRemaining() === 0;
  const recentTx = transactions.length > 0 ? transactions.slice(0, 5) : serverTx.slice(0, 5);

  const formatAmount = (n: number) => {
    const abs = Math.abs(n);
    return abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
    <div className="min-h-screen pb-28" style={{ background: '#f3f5f7' }}>
      <div className="fixed top-0 left-1/2 -translate-x-1/2 z-40 w-full max-w-[440px] px-5 pt-4 pb-3" style={{ background: 'rgba(243,245,247,0.96)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
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

        <div className="relative rounded-2xl p-5 overflow-hidden mb-5" style={{ background: 'linear-gradient(135deg, #e8fff1 0%, #e0f2fe 50%, #f3e8ff 100%)', border: '1px solid rgba(16,185,129,0.15)' }}>
          <div className="absolute top-0 right-0 w-40 h-40 rounded-full" style={{ background: 'radial-gradient(circle, rgba(16,185,129,0.12) 0%, transparent 70%)' }} />
          <div className="absolute bottom-0 left-0 w-32 h-32 rounded-full" style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.08) 0%, transparent 70%)' }} />
          <div className="relative">
            <div className="flex items-center gap-2 mb-4">
              <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider badge-premium">Active</span>
            </div>
            <p className="text-xs mb-1" style={{ color: '#666' }}>Total Balance</p>
            <h2 className="text-3xl font-bold tabular-nums mb-4" style={{ color: '#1a1a1a' }}>
              ${formatAmount(wallet.balance)}
            </h2>
            <div className="flex gap-4">
              <div>
                <p className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: '#999' }}>Deposit</p>
                <p className="text-sm font-semibold tabular-nums" style={{ color: '#10b981' }}>${formatAmount(wallet.depositBalance)}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: '#999' }}>Bonus</p>
                <p className="text-sm font-semibold tabular-nums" style={{ color: '#8b5cf6' }}>${formatAmount(wallet.bonusBalance)}</p>
              </div>
            </div>
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

        <div className="rounded-2xl p-4 mb-5 card-premium">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
              </svg>
              <span className="text-sm font-semibold" style={{ color: '#1a1a1a' }}>Deposit Bonus (4%)</span>
            </div>
            {hasDeposit && !bonusClaimed && <span className="text-[10px] px-2 py-0.5 rounded-md" style={{ background: 'rgba(139,92,246,0.1)', color: '#a78bfa' }}>4% of ${wallet.depositBalance.toFixed(2)}</span>}
            {bonusClaimed && <span className="text-[10px] px-2 py-0.5 rounded-md" style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981' }}>Claimed</span>}
          </div>
          {hasDeposit && !bonusClaimed ? (
            <>
              <div className="flex items-center gap-2 mb-3">
                <div className="flex-1 text-center py-2 rounded-lg" style={{ background: '#fff', border: '1px solid #f0f0f0' }}>
                  <span className="text-lg font-bold tabular-nums" style={{ color: '#1a1a1a' }}>{String(countdown.h).padStart(2, '0')}</span>
                  <p className="text-[9px] uppercase tracking-wider mt-0.5" style={{ color: '#999' }}>HRS</p>
                </div>
                <span className="text-lg font-bold" style={{ color: '#ccc' }}>:</span>
                <div className="flex-1 text-center py-2 rounded-lg" style={{ background: '#fff', border: '1px solid #f0f0f0' }}>
                  <span className="text-lg font-bold tabular-nums" style={{ color: '#1a1a1a' }}>{String(countdown.m).padStart(2, '0')}</span>
                  <p className="text-[9px] uppercase tracking-wider mt-0.5" style={{ color: '#999' }}>MIN</p>
                </div>
                <span className="text-lg font-bold" style={{ color: '#ccc' }}>:</span>
                <div className="flex-1 text-center py-2 rounded-lg" style={{ background: '#fff', border: '1px solid #f0f0f0' }}>
                  <span className="text-lg font-bold tabular-nums" style={{ color: '#1a1a1a' }}>{String(countdown.s).padStart(2, '0')}</span>
                  <p className="text-[9px] uppercase tracking-wider mt-0.5" style={{ color: '#999' }}>SEC</p>
                </div>
              </div>
              <button
                onClick={canClaim ? () => { claimBonus().catch(console.error); } : undefined}
                disabled={!canClaim}
                className={`w-full py-3 rounded-xl text-sm font-semibold ${canClaim ? 'btn-premium text-white' : ''}`}
                style={!canClaim ? { background: '#f9fafb', color: '#999', border: '1px solid #f0f0f0' } : {}}
              >
                {canClaim ? `Claim $${formatAmount(bonusAmount)} Bonus` : `Available in ${String(countdown.h).padStart(2, '0')}:${String(countdown.m).padStart(2, '0')}:${String(countdown.s).padStart(2, '0')}`}
              </button>
            </>
          ) : (
            <button
              onClick={() => router.push('/deposit')}
              className="w-full py-3 rounded-xl text-sm font-semibold btn-premium text-white"
            >
              {bonusClaimed ? 'Bonus Claimed' : 'Make a Deposit'}
            </button>
          )}
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
                    <p className="text-[10px]" style={{ color: '#999' }}>{new Date(tx.date).toLocaleDateString()}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-semibold tabular-nums" style={{ color: tx.amount >= 0 ? '#10b981' : '#f87171' }}>
                      {tx.amount >= 0 ? '+' : ''}{Math.abs(tx.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </p>
                    <p className="text-[10px] capitalize" style={{ color: getStatusColor(tx.status) }}>{tx.status}</p>
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
