'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/store/useStore';
import MobileNav from '@/components/layout/MobileNav';

export default function WithdrawPage() {
  const router = useRouter();
  const isLoggedIn = useStore((s) => s.isLoggedIn);
  const wallet = useStore((s) => s.wallet);
  const withdraw = useStore((s) => s.withdraw);
  const lastDepositDate = useStore((s) => s.lastDepositDate);
  const lastDepositAmount = useStore((s) => s.lastDepositAmount);
  const user = useStore((s) => s.user);
  const refreshUser = useStore((s) => s.refreshUser);
  const rawTx = useStore((s) => s.transactions) || [];
  const [address, setAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [walletType, setWalletType] = useState<'deposit' | 'bonus'>('deposit');
  const network = 'BEP20' as const;
  const [step, setStep] = useState<'form' | 'otp' | 'success'>('form');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [withdrawError, setWithdrawError] = useState('');
  const [formError, setFormError] = useState('');
  const [lockMs, setLockMs] = useState(0);
  const [filterTab, setFilterTab] = useState<'all' | 'completed' | 'pending' | 'failed'>('all');

  useEffect(() => {
    if (!isLoggedIn) router.replace('/auth/login');
    void refreshUser();
    const interval = setInterval(() => {
      void refreshUser();
    }, 8000);
    return () => clearInterval(interval);
  }, [isLoggedIn, router, refreshUser]);

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
  const locked = lockMs > 0 && !isAdmin && walletType === 'deposit';
  const lockH = Math.floor(lockMs / 3600000);
  const lockM = Math.floor((lockMs % 3600000) / 60000);
  const lockS = Math.floor((lockMs % 60000) / 1000);

  const fee = 0.3;
  const amountVal = parseFloat(amount) || 0;
  const receiveAmount = amountVal > fee ? amountVal - fee : 0;
  const selectedBalance = walletType === 'deposit' ? wallet.depositBalance : wallet.bonusBalance;
  const isValid = amountVal > fee && amountVal <= selectedBalance && address.trim().length > 5 && !locked;

  const withdrawalTx = rawTx.filter((t) => t && t.type === 'withdrawal');
  const filteredTx = filterTab === 'all' ? withdrawalTx : withdrawalTx.filter((t) => t && t.status === filterTab);

  const handleMax = () => {
    setFormError('');
    setAmount(String(selectedBalance > fee ? (selectedBalance) : 0));
  };

  const handleConfirm = () => {
    setFormError('');
    if (locked) {
      setFormError(`Your deposit is locked for 24 hours. Withdrawals unlock in ${String(lockH).padStart(2, '0')}:${String(lockM).padStart(2, '0')}:${String(lockS).padStart(2, '0')}.`);
      return;
    }
    const cleanAddr = address.trim();
    if (!cleanAddr || cleanAddr.length <= 5) {
      setFormError('Please enter a valid BEP-20 wallet address (e.g. 0x...).');
      return;
    }
    if (amountVal <= 0) {
      setFormError('Please enter an amount to withdraw.');
      return;
    }
    if (amountVal <= fee) {
      setFormError(`Minimum withdrawal amount is ${(fee + 0.1)} USDT (Network fee: ${fee} USDT).`);
      return;
    }
    if (amountVal > selectedBalance) {
      setFormError(`Insufficient balance. You have ${selectedBalance} USDT available in ${walletType === 'deposit' ? 'Deposit' : 'Bonus'} Wallet.`);
      return;
    }

    setWithdrawError('');
    setOtp('');
    setStep('otp');
  };

  const handleOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp) {
      setWithdrawError('Please enter your account login password');
      return;
    }
    if (locked) {
      setWithdrawError(`Your deposit is locked for 24 hours. Withdrawals unlock in ${String(lockH).padStart(2, '0')}:${String(lockM).padStart(2, '0')}:${String(lockS).padStart(2, '0')}.`);
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

      // Verified server-side: server checks the login password and deducts balance atomically
      await withdraw(amountVal, address.trim(), network, otp, walletType);
      setStep('success');
    } catch (err: any) {
      setWithdrawError(err?.message || 'Server withdrawal verification failed');
    } finally {
      setLoading(false);
    }
  };

  const formatAmount = (n: number) => n.toLocaleString('en-US');

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

        {/* Available Balance - Top */}
        <div className="rounded-2xl p-4 mb-4" style={{ background: walletType === 'deposit' ? 'rgba(16,185,129,0.08)' : 'rgba(139,92,246,0.08)', border: `1px solid ${walletType === 'deposit' ? 'rgba(16,185,129,0.2)' : 'rgba(139,92,246,0.2)'}` }}>
          <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: walletType === 'deposit' ? '#10b981' : '#8b5cf6' }}>Available from {walletType === 'deposit' ? 'Deposit' : 'Bonus'} Wallet</p>
          <p className="text-2xl font-bold tabular-nums" style={{ color: '#1a1a1a' }}>${formatAmount(walletType === 'deposit' ? wallet.depositBalance : wallet.bonusBalance)}</p>
        </div>

        {/* Wallet Selector - Below */}
        <div className="flex gap-3 mb-5">
          <button
            onClick={() => setWalletType('deposit')}
            className="flex-1 py-3 px-4 rounded-2xl text-center transition-all"
            style={{
              background: walletType === 'deposit' ? 'linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)' : '#fff',
              border: walletType === 'deposit' ? '2px solid #10b981' : '1px solid #e5e7eb',
              boxShadow: walletType === 'deposit' ? '0 4px 15px rgba(16,185,129,0.2)' : '0 2px 8px rgba(0,0,0,0.04)',
            }}
          >
            <div className="flex items-center justify-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full" style={{ background: '#10b981' }} />
              <p className="text-xs font-bold" style={{ color: walletType === 'deposit' ? '#059669' : '#666' }}>Deposit Wallet</p>
            </div>
          </button>

          <button
            onClick={() => setWalletType('bonus')}
            className="flex-1 py-3 px-4 rounded-2xl text-center transition-all"
            style={{
              background: walletType === 'bonus' ? 'linear-gradient(135deg, #ede9fe 0%, #ddd6fe 100%)' : '#fff',
              border: walletType === 'bonus' ? '2px solid #8b5cf6' : '1px solid #e5e7eb',
              boxShadow: walletType === 'bonus' ? '0 4px 15px rgba(139,92,246,0.2)' : '0 2px 8px rgba(0,0,0,0.04)',
            }}
          >
            <div className="flex items-center justify-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full" style={{ background: '#8b5cf6' }} />
              <p className="text-xs font-bold" style={{ color: walletType === 'bonus' ? '#7c3aed' : '#666' }}>Bonus Wallet</p>
            </div>
          </button>
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
              <label className="block text-xs font-semibold mb-1.5" style={{ color: '#888' }}>Wallet Address ({network})</label>
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
                <label className="text-xs font-semibold" style={{ color: '#888' }}>Amount (USDT)</label>
                <button onClick={handleMax} className="text-[10px] font-semibold px-2 py-0.5 rounded" style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981' }}>MAX</button>
              </div>
              <input
                type="number"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/^-+/, '').replace(/[^0-9.]/g, ''))}
                placeholder="0"
                className="w-full px-4 py-3 rounded-xl text-sm input-premium"
                style={{ color: '#1a1a1a' }}
              />
            </div>

            <div className="p-3 rounded-xl mb-5" style={{ background: '#fff', border: '1px solid #f0f0f0' }}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium" style={{ color: '#999' }}>Network Fee</span>
                <span className="text-xs tabular-nums" style={{ color: '#888' }}>{fee} USDT</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold" style={{ color: '#888' }}>You receive</span>
                <span className="text-sm font-semibold tabular-nums" style={{ color: '#10b981' }}>{formatAmount(receiveAmount)} USDT</span>
              </div>
            </div>

            {formError && (
              <div className="mb-4 p-3 rounded-xl text-xs flex items-center gap-2" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                <span>{formError}</span>
              </div>
            )}

            <button
              type="button"
              onClick={handleConfirm}
              className="w-full py-3.5 rounded-xl text-sm font-semibold btn-premium text-white"
            >
              {locked ? `🔒 Locked (${String(lockH).padStart(2, '0')}:${String(lockM).padStart(2, '0')}:${String(lockS).padStart(2, '0')})` : 'Confirm Withdrawal'}
            </button>
          </div>
        )}

        {step === 'otp' && (
          <div className="rounded-2xl p-5 card-premium">
            <div className="text-center mb-5">
              <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3" style={{ background: 'rgba(16,185,129,0.1)' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
              </div>
              <h3 className="text-sm font-semibold mb-1" style={{ color: '#1a1a1a' }}>Authorize Withdrawal</h3>
              <p className="text-xs px-4" style={{ color: '#999' }}>Enter your Tetherly account login password to authorize this withdrawal of {formatAmount(amountVal)} USDT</p>
            </div>

            {withdrawError && (
              <div className="mb-4 p-3 rounded-xl text-xs flex items-center gap-2" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                <span>{withdrawError}</span>
              </div>
            )}

            <form onSubmit={handleOtp}>
              <div className="mb-5 text-left">
                <label className="block text-xs font-semibold mb-1.5" style={{ color: '#888' }}>Account Login Password</label>
                <input
                  type="password"
                  value={otp}
                  onChange={(e) => { setOtp(e.target.value); setWithdrawError(''); }}
                  placeholder="Enter your account login password"
                  className="w-full px-4 py-3.5 rounded-xl text-sm input-premium"
                  style={{ color: '#1a1a1a' }}
                  autoFocus
                />
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => { setStep('form'); setWithdrawError(''); }} className="flex-1 py-3 rounded-xl text-sm font-medium" style={{ background: '#fff', color: '#888', border: '1px solid #f0f0f0' }}>
                  Back
                </button>
                <button type="submit" disabled={loading || !otp} className="flex-1 py-3 rounded-xl text-sm font-semibold btn-premium text-white disabled:opacity-40">
                  {loading ? 'Authorizing...' : 'Authorize Withdrawal'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Withdrawal History */}
        <div className="mt-5 rounded-2xl p-4 card-premium">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold" style={{ color: '#1a1a1a' }}>Withdrawal History</span>
            <div className="flex gap-1 p-0.5 rounded-lg" style={{ background: '#f9fafb' }}>
              {(['all', 'completed', 'pending', 'failed'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilterTab(f)}
                  className="px-2.5 py-1 rounded-md text-[10px] font-medium capitalize transition-all"
                  style={{
                    background: filterTab === f ? 'rgba(245,158,11,0.15)' : 'transparent',
                    color: filterTab === f ? '#d97706' : '#999',
                  }}
                >
                  {f === 'failed' ? 'Rejected' : f}
                </button>
              ))}
            </div>
          </div>

          {filteredTx.length === 0 ? (
            <p className="text-xs text-center py-6" style={{ color: '#bbb' }}>No withdrawals found</p>
          ) : (
            <div className="flex flex-col gap-2">
              {filteredTx.map((tx) => (
                <div key={tx.id} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: '#fff' }}>
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'rgba(245,158,11,0.1)' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate" style={{ color: '#1a1a1a' }}>Withdrawal ({tx.network || 'BEP20'})</p>
                    <p className="text-[10px]" style={{ color: '#999' }}>{new Date(tx.date).toLocaleDateString()}</p>
                    {tx.hash && tx.status === 'completed' && !tx.hash.startsWith('TX_') && !tx.hash.startsWith('0x_wd_') && !tx.hash.startsWith('ADMIN_DEBIT_') && (
                      <div className="flex items-center gap-1 mt-0.5">
                        <span className="text-[9px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-mono truncate max-w-[120px]" title={tx.hash}>
                          TxID: {tx.hash}
                        </span>
                        <button 
                          onClick={() => navigator.clipboard.writeText(tx.hash!)}
                          className="text-[9px] text-emerald-600 font-bold hover:underline"
                        >
                          Copy
                        </button>
                      </div>
                    )}
                    {tx.rejectReason && tx.status === 'failed' && (
                      <p className="text-[10px] text-red-500 truncate" title={tx.rejectReason}>
                        Reason: {tx.rejectReason} (Refunded)
                      </p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-semibold tabular-nums" style={{ color: '#ef4444' }}>
                      -${Math.abs(tx.amount).toLocaleString('en-US')}
                    </p>
                    <p
                      className="text-[10px] font-bold capitalize"
                      style={{
                        color: tx.status === 'completed' ? '#10b981' : tx.status === 'failed' ? '#ef4444' : '#f59e0b',
                      }}
                    >
                      {tx.status === 'failed' ? 'Rejected' : tx.status}
                    </p>
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
