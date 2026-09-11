'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/store/useStore';
import MobileNav from '@/components/layout/MobileNav';
import { getAuthToken } from '@/lib/firebaseService';

interface DepositHistory {
  deposits: any[];
  pagination: { page: number; limit: number; hasMore: boolean; total: number };
  summary: { totalDeposited: number; completedCount: number; pendingCount: number; failedCount: number };
}

export default function DepositPage() {
  const router = useRouter();
  const isLoggedIn = useStore((s) => s.isLoggedIn);
  const deposit = useStore((s) => s.deposit);
  const refreshUser = useStore((s) => s.refreshUser);
  const rawTx = useStore((s) => s.transactions) || [];
  const network: 'BEP20' = 'BEP20';
  const [amount, setAmount] = useState('');
  const [txHash, setTxHash] = useState('');
  const [filterTab, setFilterTab] = useState<'all' | 'completed' | 'pending' | 'failed'>('all');
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState<DepositHistory | null>(null);

  // Status States
  const [verifyState, setVerifyState] = useState<'idle' | 'verified' | 'error'>('idle');
  const [verifyMsg, setVerifyMsg] = useState('');
  const [step, setStep] = useState<'form' | 'success'>('form');

  const fetchHistory = useCallback(async () => {
    try {
      const token = getAuthToken();
      const res = await fetch('/api/deposits/history?limit=50', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        setHistory(data);
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (!isLoggedIn) router.replace('/auth/login');
    void refreshUser();
    void fetchHistory();
    const interval = setInterval(() => {
      void refreshUser();
      void fetchHistory();
    }, 5000);
    return () => clearInterval(interval);
  }, [isLoggedIn, router, refreshUser, fetchHistory]);

  if (!isLoggedIn) return null;

  const depositAddress = (process.env.NEXT_PUBLIC_DEPOSIT_WALLET_BEP20 && !process.env.NEXT_PUBLIC_DEPOSIT_WALLET_BEP20.includes('XXX'))
    ? process.env.NEXT_PUBLIC_DEPOSIT_WALLET_BEP20
    : '';
  const quickAmounts = [10, 50, 100, 500];

  const handleCopy = () => {
    navigator.clipboard.writeText(depositAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleQuickAmount = (a: number) => {
    setAmount(String(a));
    if (verifyState !== 'idle') setVerifyState('idle');
  };

  const BSC_TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/;

  const handleDeposit = async () => {
    const val = parseFloat(amount);
    if (!val || val <= 0) {
      setVerifyState('error');
      setVerifyMsg('Enter a valid amount (min 1 USDT).');
      return;
    }

    const trimmedHash = txHash.trim();
    if (!trimmedHash) {
      setVerifyState('error');
      setVerifyMsg('Paste your BSC transaction hash from your wallet.');
      return;
    }
    if (!BSC_TX_HASH_RE.test(trimmedHash)) {
      setVerifyState('error');
      setVerifyMsg('Invalid hash format. Must be 0x followed by 64 characters.');
      return;
    }

    try {
      const depositReq = await deposit(val, network, trimmedHash);
      if (depositReq) {
        setStep('success');
        setAmount('');
        setTxHash('');
      } else {
        setVerifyState('error');
        setVerifyMsg('Deposit failed. Please check your details and try again.');
      }
    } catch (err: any) {
      setVerifyState('error');
      const msg = err?.message || '';
      if (msg.includes('already been submitted')) {
        setVerifyMsg('This transaction hash was already used. Use a new hash from your wallet.');
      } else if (msg.includes('Invalid TxID')) {
        setVerifyMsg('Invalid hash format. Must be 0x followed by 64 characters.');
      } else {
        setVerifyMsg('Something went wrong. Please try again.');
      }
    }
  };

  const transactions = rawTx.filter((tx) => tx && tx.type === 'deposit');
  const filteredTx = filterTab === 'all' ? transactions : transactions.filter((tx) => tx && tx.status === filterTab);

  const txHashValid = BSC_TX_HASH_RE.test(txHash.trim());
    const canSubmit = amount && parseFloat(amount) > 0 && txHashValid;

  const formatAmount = (n: number) => n.toLocaleString('en-US');
  const depositedAmount = parseFloat(amount) || 0;

  if (step === 'success') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6" style={{ background: '#f3f5f7' }}>
        <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{ background: 'rgba(16,185,129,0.1)' }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <h2 className="text-xl font-bold mb-2" style={{ color: '#1a1a1a' }}>Deposit Submitted</h2>
        <p className="text-sm text-center mb-6" style={{ color: '#888' }}>Your deposit is being verified. Balance will update shortly.</p>
        <button onClick={() => setStep('form')} className="w-full max-w-xs py-3 rounded-xl text-white font-semibold text-sm btn-premium">
          Back to Deposit
        </button>
      </div>
    );
  }

    return (
    <div className="min-h-screen pb-28" style={{ background: '#f3f5f7' }}>
      <div className="px-5 pt-5 pb-6">
        <h1 className="text-xl font-bold mb-5" style={{ color: '#1a1a1a' }}>Deposit USDT</h1>

        {/* Deposit Status Banners */}
        {verifyState === 'verified' && (
          <div className="mb-5 p-4 rounded-2xl flex items-center gap-3 shadow-sm" style={{ background: 'linear-gradient(135deg, #ecfdf5, #d1fae5)', border: '1px solid #a7f3d0' }}>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: '#10b981', boxShadow: '0 4px 12px rgba(16,185,129,0.3)' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <div>
              <p className="font-bold text-xs" style={{ color: '#065f46' }}>Deposit Submitted!</p>
              <p className="text-[11px] mt-0.5" style={{ color: '#047857' }}>{verifyMsg}</p>
            </div>
          </div>
        )}

        {verifyState === 'error' && (
          <div className="mb-5 p-4 rounded-2xl flex items-center gap-3 shadow-sm" style={{ background: 'linear-gradient(135deg, #fff1f2, #ffe4e6)', border: '1px solid #fecdd3' }}>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: '#f43f5e', boxShadow: '0 4px 12px rgba(244,63,94,0.3)' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            </div>
            <div>
              <p className="font-bold text-xs" style={{ color: '#9f1239' }}>Something went wrong</p>
              <p className="text-[11px] mt-0.5" style={{ color: '#be123c' }}>{verifyMsg}</p>
            </div>
          </div>
        )}

        <div className="rounded-2xl p-5 mb-5 card-premium">
          <div className="flex flex-col items-center mb-5">
            {depositAddress ? (
              <>
                <div className="mb-3 px-3 py-1.5 rounded-full text-xs font-bold" style={{ background: 'rgba(245,158,11,0.12)', color: '#d97706', border: '1px solid rgba(245,158,11,0.25)' }}>
                  BEP20 (Binance Smart Chain)
                </div>
                <div className="w-40 h-40 rounded-xl flex items-center justify-center mb-3 overflow-hidden" style={{ background: '#fff', border: '1px solid #f0f0f0' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/deposit-qr.jpeg" alt="BSC USDT Deposit Address QR Code" className="w-40 h-40 object-contain" />
                </div>
                <p className="text-xs font-semibold mb-1" style={{ color: '#999' }}>BSC USDT Deposit Address</p>
              </>
            ) : (
              <div className="text-center py-6 rounded-xl" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                <p className="text-sm font-medium" style={{ color: '#ef4444' }}>Deposit address not configured</p>
                <p className="text-xs mt-1" style={{ color: '#999' }}>Contact admin to set up deposit wallet.</p>
              </div>
            )}
          </div>

          {depositAddress && (
          <div className="flex items-center gap-2 p-3 rounded-xl mb-4" style={{ background: '#fff', border: '1px solid #f0f0f0' }}>
            <span className="flex-1 text-xs font-mono break-all" style={{ color: '#555' }}>{depositAddress}</span>
            <button onClick={handleCopy} className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: copied ? 'rgba(16,185,129,0.15)' : '#f9fafb' }}>
              {copied ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
              )}
            </button>
          </div>
          )}

          <div className="mb-4">
            <label className="block text-xs font-semibold mb-1.5" style={{ color: '#888' }}>Quick Amount</label>
            <div className="grid grid-cols-4 gap-2">
              {quickAmounts.map((a) => (
                <button
                  key={a}
                  onClick={() => handleQuickAmount(a)}
                  className="py-2.5 rounded-lg text-xs font-semibold transition-all"
                  style={{
                    background: amount === String(a) ? 'rgba(16,185,129,0.15)' : '#fff',
                    color: amount === String(a) ? '#10b981' : '#888',
                    border: amount === String(a) ? '1px solid rgba(16,185,129,0.2)' : '1px solid #f0f0f0',
                  }}
                >
                  ${a}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-xs font-semibold mb-1.5" style={{ color: '#888' }}>Amount (USDT)</label>
            <input
              type="number"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/^-+/, '').replace(/[^0-9.]/g, ''))}
              placeholder="Enter amount"
              className="w-full px-4 py-3 rounded-xl text-sm input-premium"
              style={{ color: '#1a1a1a' }}
            />
          </div>

          <div className="mb-4">
            <label className="block text-xs font-semibold mb-1.5" style={{ color: '#888' }}>
              Transaction Hash / TxID
            </label>
            <input
              type="text"
              value={txHash}
              onChange={(e) => { setTxHash(e.target.value); setVerifyState('idle'); }}
              placeholder="Paste 0x... BSC Transaction Hash"
              className="w-full px-4 py-3 rounded-xl text-xs font-mono input-premium"
              style={{ color: '#1a1a1a' }}
            />
            <span className="text-[10px] font-medium text-slate-400 mt-1 block">
              Required. Paste the transaction hash from your BSC wallet after sending USDT.
            </span>
          </div>

          <button
            onClick={handleDeposit}
            disabled={!canSubmit}
            className="w-full py-4 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98]"
            style={{
              background: (!canSubmit) ? '#d1faeb' : '#10b981',
              color: (!canSubmit) ? '#9fb8ad' : '#fff',
              boxShadow: (!canSubmit) ? 'none' : '0 4px 14px rgba(16,185,129,0.3)',
              cursor: (!canSubmit) ? 'not-allowed' : 'pointer',
            }}
          >
            Submit Deposit for Verification
          </button>
        </div>

        <div className="rounded-2xl p-4 card-premium mb-5">
          <p className="text-sm font-semibold mb-3" style={{ color: '#1a1a1a' }}>Deposit Summary</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-xl" style={{ background: '#f0fdf4' }}>
              <p className="text-[10px] font-semibold" style={{ color: '#16a34a' }}>Total Deposited</p>
              <p className="text-lg font-bold tabular-nums" style={{ color: '#15803d' }}>${(history?.summary.totalDeposited || 0).toLocaleString('en-US')}</p>
            </div>
            <div className="p-3 rounded-xl" style={{ background: '#eff6ff' }}>
              <p className="text-[10px] font-semibold" style={{ color: '#2563eb' }}>Completed</p>
              <p className="text-lg font-bold" style={{ color: '#1d4ed8' }}>{history?.summary.completedCount || 0}</p>
            </div>
            <div className="p-3 rounded-xl" style={{ background: '#fffbeb' }}>
              <p className="text-[10px] font-semibold" style={{ color: '#d97706' }}>Pending</p>
              <p className="text-lg font-bold" style={{ color: '#b45309' }}>{history?.summary.pendingCount || 0}</p>
            </div>
            <div className="p-3 rounded-xl" style={{ background: '#fef2f2' }}>
              <p className="text-[10px] font-semibold" style={{ color: '#dc2626' }}>Failed/Rejected</p>
              <p className="text-lg font-bold" style={{ color: '#b91c1c' }}>{history?.summary.failedCount || 0}</p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl p-4 card-premium">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold" style={{ color: '#1a1a1a' }}>Deposit History</span>
            <div className="flex gap-1 p-0.5 rounded-lg" style={{ background: '#f9fafb' }}>
              {(['all', 'completed', 'pending', 'failed'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilterTab(f)}
                  className="px-2.5 py-1 rounded-md text-[10px] font-medium capitalize transition-all"
                  style={{
                    background: filterTab === f ? 'rgba(16,185,129,0.15)' : 'transparent',
                    color: filterTab === f ? '#10b981' : '#999',
                  }}
                >
                  {f === 'failed' ? 'Rejected' : f}
                </button>
              ))}
            </div>
          </div>

          {filteredTx.length === 0 ? (
            <p className="text-xs text-center py-6" style={{ color: '#bbb' }}>No deposits found</p>
          ) : (
            <div className="flex flex-col gap-2">
              {filteredTx.map((tx) => (
                <div key={tx.id} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: '#fff' }}>
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: 'rgba(16,185,129,0.1)' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1v22"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium" style={{ color: '#1a1a1a' }}>Deposit ({tx.network})</p>
                    <p className="text-[10px]" style={{ color: '#999' }}>{new Date(tx.date).toLocaleDateString()}</p>
                    {tx.status === 'pending' && (
                      <p className="text-[10px]" style={{ color: '#f59e0b' }}>Verifying on blockchain...</p>
                    )}
                    {tx.rejectReason && tx.status === 'failed' && (
                      <p className="text-[10px] text-red-500 truncate" title={tx.rejectReason}>
                        Reason: {tx.rejectReason}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-semibold tabular-nums" style={{ color: '#10b981' }}>+${tx.amount.toLocaleString('en-US')}</p>
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
