'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/store/useStore';
import MobileNav from '@/components/layout/MobileNav';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export default function WithdrawPage() {
  const router = useRouter();
  const { isLoggedIn, wallet, withdraw, lastDepositDate, lastDepositAmount, user } = useStore();
  const [address, setAddress] = useState('');
  const [amount, setAmount] = useState('');
  const network = 'BEP20' as const;
  const [step, setStep] = useState<'form' | 'otp' | 'success'>('form');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [withdrawError, setWithdrawError] = useState('');
  const [lockMs, setLockMs] = useState(0);

  useEffect(() => {
    if (!isLoggedIn) router.replace('/auth/login');
  }, [isLoggedIn, router]);

  // 24h deposit lock countdown: withdrawals are blocked while the latest deposit
  // is within its 24h window.
  useEffect(() => {
    const updateLock = () => {
      if (lastDepositDate && lastDepositAmount > 0) {
        const until = new Date(lastDepositDate).getTime() + 24 * 60 * 60 * 1000;
        setLockMs(Math.max(0, until - Date.now()));
      } else {
        setLockMs(0);
      }
    };
    updateLock();
    const interval = setInterval(updateLock, 1000);
    return () => clearInterval(interval);
  }, [lastDepositDate, lastDepositAmount]);

  if (!isLoggedIn) return null;

  // The admin (operator) is exempt from the 24h deposit lock.
  const isAdmin = !!user?.isAdmin;
  const locked = lockMs > 0 && !isAdmin;
  const lockH = Math.floor(lockMs / 3600000);
  const lockM = Math.floor((lockMs % 3600000) / 60000);
  const lockS = Math.floor((lockMs % 60000) / 1000);

  const fee = 0.3;
  const amountVal = parseFloat(amount) || 0;
  const receiveAmount = amountVal > 0 ? amountVal - fee : 0;
  const isValid = amountVal > 0 && amountVal <= wallet.balance && address.length > 5 && !locked;

  const handleMax = () => {
    setAmount(String(wallet.balance > fee ? wallet.balance - fee : 0));
  };

  const handleConfirm = () => {
    if (!isValid) return;
    setWithdrawError('');
    setOtp('');
    setStep('otp');
  };

  const handleOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp) {
      setWithdrawError('Please enter your login password');
      return;
    }
    if (locked) {
      setWithdrawError('Your deposit is locked for 24 hours. Withdrawals will reopen when the countdown finishes.');
      return;
    }
    setWithdrawError('');
    setLoading(true);

    try {
      const currentUser = useStore.getState().user;
      if (!currentUser) {
        setWithdrawError('Session expired. Please log in again.');
        setLoading(false);
        return;
      }

      // Server-Side First: Verify user status and balance directly from Firebase
      let serverBalance = wallet.balance;
      try {
        const userDocRef = doc(db, 'users', currentUser.id);
        const docSnap = await getDoc(userDocRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.status === 'blocked') {
            setWithdrawError('Your account has been suspended by admin. Withdrawals blocked.');
            setLoading(false);
            return;
          }
          serverBalance = Number(data.balance ?? 0);
        }
      } catch (err) {
        console.warn('Server verification fallback:', err);
      }

      if (serverBalance < amountVal) {
        setWithdrawError(`Server verification failed: Insufficient balance on server. Available: ${serverBalance.toFixed(2)} USDT`);
        setLoading(false);
        return;
      }

      // Verified server-side: server re-checks the login password against the
      // user document, then deducts the balance atomically (with 24h lock).
      await withdraw(amountVal, address, network, otp);
      setStep('success');
    } catch (err: any) {
      setWithdrawError(err?.message || 'Server withdrawal verification failed');
    } finally {
      setLoading(false);
    }
  };

  const formatAmount = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  if (step === 'success') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6" style={{ background: '#f3f5f7' }}>
        <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{ background: 'rgba(16,185,129,0.1)' }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <h2 className="text-xl font-bold mb-2" style={{ color: '#1a1a1a' }}>Withdrawal Submitted</h2>
        <p className="text-sm text-center mb-6" style={{ color: '#888' }}>Your withdrawal of {formatAmount(amountVal)} USDT is being processed.</p>
        <button onClick={() => { setStep('form'); setAddress(''); setAmount(''); setOtp(''); }} className="w-full max-w-xs py-3 rounded-xl text-white font-semibold text-sm btn-premium">
          Back to Withdraw
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-28" style={{ background: '#f3f5f7' }}>
      <div className="px-5 pt-5 pb-6">
        <h1 className="text-xl font-bold mb-5" style={{ color: '#1a1a1a' }}>Withdraw USDT</h1>

        <div className="rounded-2xl p-4 mb-5" style={{ background: 'linear-gradient(135deg, #e8fff1 0%, #e0f2fe 50%, #f3e8ff 100%)', border: '1px solid rgba(16,185,129,0.12)' }}>
          <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: '#999' }}>Available Balance</p>
          <p className="text-2xl font-bold tabular-nums" style={{ color: '#1a1a1a' }}>${formatAmount(wallet.balance)}</p>
        </div>

<div className="rounded-2xl p-4 mb-3 card-premium flex items-center justify-center">
  <span className="px-3 py-1.5 rounded-full text-xs font-bold" style={{ background: 'rgba(245,158,11,0.12)', color: '#d97706', border: '1px solid rgba(245,158,11,0.25)' }}>
    BEP-20 (Binance Smart Chain)
  </span>
</div>

        {locked && (
          <div className="rounded-2xl p-4 mb-4" style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)' }}>
            <p className="text-xs font-semibold mb-1" style={{ color: '#d97706' }}>🔒 Deposit Locked</p>
            <p className="text-[11px]" style={{ color: '#b45309' }}>
              Withdrawals unlock in <span className="font-bold tabular-nums">{String(lockH).padStart(2, '0')}:{String(lockM).padStart(2, '0')}:{String(lockS).padStart(2, '0')}</span> — your deposit is locked for 24 hours. After the countdown you can withdraw your deposit and bonus.
            </p>
          </div>
        )}

        {step === 'form' && (
          <div className="rounded-2xl p-5 card-premium">
            <div className="mb-4">
              <label className="block text-xs font-medium mb-1.5" style={{ color: '#888' }}>Wallet Address ({network})</label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="0x..."
                className="w-full px-4 py-3 rounded-xl text-sm input-premium font-mono"
                style={{ color: '#1a1a1a' }}
              />
            </div>

            <div className="mb-4">
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium" style={{ color: '#888' }}>Amount (USDT)</label>
                <button onClick={handleMax} className="text-[10px] font-semibold px-2 py-0.5 rounded" style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981' }}>MAX</button>
              </div>
              <input
                type="number"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/^-+/, '').replace(/[^0-9.]/g, ''))}
                placeholder="0.00"
                className="w-full px-4 py-3 rounded-xl text-sm input-premium"
                style={{ color: '#1a1a1a' }}
              />
            </div>

            <div className="p-3 rounded-xl mb-5" style={{ background: '#fff', border: '1px solid #f0f0f0' }}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs" style={{ color: '#999' }}>Network Fee</span>
                <span className="text-xs tabular-nums" style={{ color: '#888' }}>{fee} USDT</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium" style={{ color: '#888' }}>You receive</span>
                <span className="text-sm font-semibold tabular-nums" style={{ color: '#10b981' }}>{formatAmount(receiveAmount)} USDT</span>
              </div>
            </div>

            <button
              onClick={handleConfirm}
              disabled={!isValid}
              className={`w-full py-3.5 rounded-xl text-sm font-semibold ${isValid ? 'btn-premium text-white' : ''}`}
              style={!isValid ? { background: '#f9fafb', color: '#bbb', border: '1px solid #f0f0f0' } : {}}
            >
              Confirm Withdrawal
            </button>
          </div>
        )}

        {step === 'otp' && (
          <div className="rounded-2xl p-5 card-premium">
            <div className="text-center mb-5">
              <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3" style={{ background: 'rgba(16,185,129,0.1)' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
              </div>
              <h3 className="text-sm font-semibold mb-1" style={{ color: '#1a1a1a' }}>Verify Withdrawal</h3>
              <p className="text-xs px-6" style={{ color: '#999' }}>Enter your login password to confirm this withdrawal of {formatAmount(amountVal)} USDT</p>
            </div>

            {withdrawError && (
              <div className="mb-4 p-3 rounded-xl text-xs" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}>
                {withdrawError}
              </div>
            )}

            <form onSubmit={handleOtp}>
              <div className="mb-5">
                <input
                  type="password"
                  value={otp}
                  onChange={(e) => { setOtp(e.target.value); setWithdrawError(''); }}
                  placeholder="Enter your login password"
                  className="w-full px-4 py-3.5 rounded-xl text-center text-sm input-premium"
                  style={{ color: '#1a1a1a' }}
                  autoFocus
                />
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setStep('form')} className="flex-1 py-3 rounded-xl text-sm font-medium" style={{ background: '#fff', color: '#888', border: '1px solid #f0f0f0' }}>
                  Back
                </button>
                <button type="submit" disabled={loading || !otp} className="flex-1 py-3 rounded-xl text-sm font-semibold btn-premium text-white disabled:opacity-40">
                  {loading ? 'Verifying...' : 'Verify & Submit'}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
      <MobileNav />
    </div>
  );
}
