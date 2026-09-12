'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/store/useStore';
import MobileNav from '@/components/layout/MobileNav';
import { Gift } from 'lucide-react';

const BONUS_RATE = 0.04;

export default function BonusPage() {
  const router = useRouter();
  const isLoggedIn = useStore((s) => s.isLoggedIn);
  const wallet = useStore((s) => s.wallet);
  const lastDepositDate = useStore((s) => s.lastDepositDate);
  const lastDepositAmount = useStore((s) => s.lastDepositAmount);
  const pendingClaims = useStore((s) => s.pendingClaims);
  const lastBonusGeneratedAt = useStore((s) => s.lastBonusGeneratedAt);
  const transactions = useStore((s) => s.transactions);
  const claimBonus = useStore((s) => s.claimBonus);
  const refreshUser = useStore((s) => s.refreshUser);
  const [countdown, setCountdown] = useState({ h: 0, m: 0, s: 0 });
  const [claiming, setClaiming] = useState(false);

  // Same logic as dashboard — based on pendingClaims + lastBonusGeneratedAt
  const getRemaining = useCallback(() => {
    if (!lastDepositDate || lastDepositAmount <= 0) return 0;
    if ((wallet.depositBalance ?? 0) <= 0) return 0;
    if (pendingClaims > 0) return 0; // Already ready to claim
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

    // Sync fresh data from server on mount
    void refreshUser();

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
  }, [isLoggedIn, router, getRemaining, refreshUser]);

  if (!isLoggedIn) return null;

  const hasDeposit = !!lastDepositDate && lastDepositAmount > 0 && wallet.depositBalance > 0;
  const bonusPerClaim = hasDeposit ? Math.round(wallet.depositBalance * BONUS_RATE * 100) / 100 : 0;
  const totalPendingBonus = Math.round(bonusPerClaim * pendingClaims * 100) / 100;
  const canClaim = hasDeposit && pendingClaims > 0;
  const waiting = hasDeposit && pendingClaims === 0 && getRemaining() > 0;

  const bonusHistory = transactions.filter((tx) => tx.type === 'bonus').slice(0, 10);
  const totalEarned = bonusHistory.reduce((sum, tx) => sum + tx.amount, 0);

  const handleClaim = async () => {
    if (!canClaim || claiming) return;
    setClaiming(true);
    try {
      await claimBonus();
    } catch (e: any) {
      console.error(e);
    } finally {
      setClaiming(false);
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
            <Gift size={48} color="#10b981" strokeWidth={1.5} className="mx-auto mb-3" />
            <p className="text-xs mb-1" style={{ color: '#888' }}>4% of your deposit</p>

            {/* Show pending total or per-claim amount */}
            <h2 className="text-3xl font-bold tabular-nums mb-1" style={{ color: '#1a1a1a' }}>
              ${canClaim ? totalPendingBonus : bonusPerClaim}
            </h2>
            {hasDeposit && (
              <p className="text-[10px] mb-4" style={{ color: '#999' }}>
                {canClaim && pendingClaims > 1
                  ? `${pendingClaims} claims ready · $${bonusPerClaim} each`
                  : `on $${wallet.depositBalance} deposit balance`}
              </p>
            )}
            {!hasDeposit && <p className="text-[10px] mb-4" style={{ color: '#999' }}>make a deposit to unlock</p>}

            {hasDeposit ? (
              <>
                {/* Countdown — only show when waiting for next claim */}
                {waiting && (
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
                )}

                <button
                  onClick={handleClaim}
                  disabled={!canClaim || claiming}
                  className={`w-full py-3.5 rounded-xl text-sm font-semibold ${canClaim && !claiming ? 'btn-premium text-white' : ''}`}
                  style={!canClaim || claiming ? { background: '#f9fafb', color: '#999' } : {}}
                >
                  {claiming
                    ? 'Claiming...'
                    : canClaim
                      ? `Claim $${totalPendingBonus}${pendingClaims > 1 ? ` (${pendingClaims} claims)` : ''}`
                      : waiting
                        ? `Next in ${String(countdown.h).padStart(2, '0')}:${String(countdown.m).padStart(2, '0')}:${String(countdown.s).padStart(2, '0')}`
                        : 'Loading...'}
                </button>
              </>
            ) : (
              <button
                onClick={() => router.push('/deposit')}
                className="w-full py-3.5 rounded-xl text-sm font-semibold btn-premium text-white"
              >
                Make a Deposit
              </button>
            )}
          </div>
        </div>

        <div className="rounded-2xl p-4 card-premium mb-5">
          <div className="flex items-center gap-2 mb-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#999' }}>Total Earned</span>
          </div>
          <p className="text-2xl font-bold tabular-nums" style={{ color: '#10b981' }}>${totalEarned.toLocaleString('en-US')}</p>
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
                    <Gift size={16} color="#8b5cf6" strokeWidth={2.5} />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-medium" style={{ color: '#1a1a1a' }}>Deposit Bonus</p>
                    <p className="text-[10px]" style={{ color: '#999' }}>{new Date(tx.date).toLocaleDateString()}</p>
                  </div>
                  <p className="text-xs font-semibold tabular-nums" style={{ color: '#10b981' }}>+${tx.amount.toLocaleString('en-US')}</p>
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