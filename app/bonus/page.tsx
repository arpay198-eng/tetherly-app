'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/store/useStore';
import MobileNav from '@/components/layout/MobileNav';

const BONUS_RATE = 0.04;

export default function BonusPage() {
  const router = useRouter();
  const { isLoggedIn, wallet, lastDepositDate, lastDepositAmount, bonusClaimed, transactions, claimBonus } = useStore();
  const [countdown, setCountdown] = useState({ h: 0, m: 0, s: 0 });

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
    return () => clearInterval(interval);
  }, [isLoggedIn, router, getRemaining]);

  if (!isLoggedIn) return null;

  const hasDeposit = !!lastDepositDate && lastDepositAmount > 0 && wallet.depositBalance > 0;
  const bonusAmount = hasDeposit ? wallet.depositBalance * BONUS_RATE : 0;
  const canClaim = hasDeposit && !bonusClaimed && getRemaining() === 0;
  const waiting = hasDeposit && !bonusClaimed && getRemaining() > 0;

  const bonusHistory = transactions.filter((tx) => tx.type === 'bonus').slice(0, 10);
  const totalEarned = bonusHistory.reduce((sum, tx) => sum + tx.amount, 0);

  const handleClaim = () => {
    if (canClaim) {
      claimBonus().catch(console.error);
    }
  };

  return (
    <div className="min-h-screen pb-28" style={{ background: '#f3f5f7' }}>
      <div className="px-5 pt-5 pb-6">
        <h1 className="text-xl font-bold mb-5" style={{ color: '#1a1a1a' }}>Deposit Bonus</h1>

        <div className="relative rounded-2xl p-6 mb-5 overflow-hidden" style={{ background: 'linear-gradient(135deg, #e8fff1 0%, #e0f2fe 50%, #f3e8ff 100%)', border: '1px solid rgba(16,185,129,0.12)' }}>
          <div className="absolute top-0 right-0 w-48 h-48 rounded-full" style={{ background: 'radial-gradient(circle, rgba(16,185,129,0.15) 0%, transparent 70%)' }} />
          <div className="absolute bottom-0 left-0 w-36 h-36 rounded-full" style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.1) 0%, transparent 70%)' }} />
          <div className="relative text-center">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-3">
              <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
            </svg>
            <p className="text-xs mb-1" style={{ color: '#888' }}>4% of your deposit</p>
            <h2 className="text-3xl font-bold tabular-nums mb-1" style={{ color: '#1a1a1a' }}>${bonusAmount.toFixed(2)}</h2>
            {hasDeposit && <p className="text-[10px] mb-4" style={{ color: '#999' }}>on ${wallet.depositBalance.toFixed(2)} deposit balance</p>}
            {!hasDeposit && <p className="text-[10px] mb-4" style={{ color: '#999' }}>make a deposit to unlock</p>}

            {hasDeposit && !bonusClaimed ? (
              <>
                <div className="flex items-center justify-center gap-2 mb-5">
                  <div className="w-16 text-center py-2.5 rounded-lg" style={{ background: '#fff', border: '1px solid #e5e7eb' }}>
                    <span className="text-xl font-bold tabular-nums" style={{ color: '#1a1a1a' }}>{String(countdown.h).padStart(2, '0')}</span>
                    <p className="text-[8px] uppercase tracking-wider mt-0.5" style={{ color: '#bbb' }}>HRS</p>
                  </div>
                  <span className="text-xl font-bold" style={{ color: '#ccc' }}>:</span>
                  <div className="w-16 text-center py-2.5 rounded-lg" style={{ background: '#fff', border: '1px solid #e5e7eb' }}>
                    <span className="text-xl font-bold tabular-nums" style={{ color: '#1a1a1a' }}>{String(countdown.m).padStart(2, '0')}</span>
                    <p className="text-[8px] uppercase tracking-wider mt-0.5" style={{ color: '#bbb' }}>MIN</p>
                  </div>
                  <span className="text-xl font-bold" style={{ color: '#ccc' }}>:</span>
                  <div className="w-16 text-center py-2.5 rounded-lg" style={{ background: '#fff', border: '1px solid #e5e7eb' }}>
                    <span className="text-xl font-bold tabular-nums" style={{ color: '#1a1a1a' }}>{String(countdown.s).padStart(2, '0')}</span>
                    <p className="text-[8px] uppercase tracking-wider mt-0.5" style={{ color: '#bbb' }}>SEC</p>
                  </div>
                </div>

                <button
                  onClick={handleClaim}
                  disabled={!canClaim}
                  className={`w-full py-3.5 rounded-xl text-sm font-semibold ${canClaim ? 'btn-premium text-white' : ''}`}
                  style={!canClaim ? { background: '#f9fafb', color: '#999' } : {}}
                >
                  {canClaim ? `Claim $${bonusAmount.toFixed(2)}` : waiting ? `Available in ${String(countdown.h).padStart(2, '0')}:${String(countdown.m).padStart(2, '0')}:${String(countdown.s).padStart(2, '0')}` : 'Bonus Claimed'}
                </button>
              </>
            ) : (
              <button
                onClick={() => router.push('/deposit')}
                className="w-full py-3.5 rounded-xl text-sm font-semibold btn-premium text-white"
              >
                {bonusClaimed ? 'Bonus Claimed' : 'Make a Deposit'}
              </button>
            )}
          </div>
        </div>

        <div className="rounded-2xl p-4 card-premium mb-5">
          <div className="flex items-center gap-2 mb-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
            <span className="text-[10px] uppercase tracking-wider" style={{ color: '#999' }}>Total Earned</span>
          </div>
          <p className="text-2xl font-bold tabular-nums" style={{ color: '#10b981' }}>${totalEarned.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
          <p className="text-[10px]" style={{ color: '#bbb' }}>from bonuses</p>
        </div>

        <div className="rounded-2xl p-4 card-premium">
          <h3 className="text-sm font-semibold mb-3" style={{ color: '#1a1a1a' }}>Bonus History</h3>
          {bonusHistory.length === 0 ? (
            <p className="text-xs text-center py-6" style={{ color: '#bbb' }}>No bonus claims yet</p>
          ) : (
            <div className="flex flex-col gap-2">
              {bonusHistory.map((tx) => (
                <div key={tx.id} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: '#fff' }}>
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: 'rgba(139,92,246,0.1)' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-medium" style={{ color: '#1a1a1a' }}>Deposit Bonus</p>
                    <p className="text-[10px]" style={{ color: '#999' }}>{new Date(tx.date).toLocaleDateString()}</p>
                  </div>
                  <p className="text-xs font-semibold tabular-nums" style={{ color: '#10b981' }}>+${tx.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
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