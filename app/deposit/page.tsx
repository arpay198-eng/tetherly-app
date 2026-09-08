'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/store/useStore';
import MobileNav from '@/components/layout/MobileNav';

export default function DepositPage() {
  const router = useRouter();
  const { isLoggedIn, deposit } = useStore();
  const rawTx = useStore((s) => s.transactions) || [];
  const network: 'BEP20' = 'BEP20';
  const [amount, setAmount] = useState('');
  const [txHash, setTxHash] = useState('');
  const [filterTab, setFilterTab] = useState<'all' | 'completed' | 'pending'>('all');
  const [copied, setCopied] = useState(false);

  // Status States
  const [verifyState, setVerifyState] = useState<'idle' | 'verified' | 'error'>('idle');
  const [verifyMsg, setVerifyMsg] = useState('');

  useEffect(() => {
    if (!isLoggedIn) router.replace('/auth/login');
  }, [isLoggedIn, router]);

  if (!isLoggedIn) return null;

  const depositAddress = (process.env.NEXT_PUBLIC_DEPOSIT_WALLET_BEP20 && !process.env.NEXT_PUBLIC_DEPOSIT_WALLET_BEP20.includes('XXX'))
    ? process.env.NEXT_PUBLIC_DEPOSIT_WALLET_BEP20
    : '0x55d398326f99059fF775485246999027B3197955';
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

  const handleDeposit = () => {
    const val = parseFloat(amount);
    if (!val || val <= 0) {
      setVerifyState('error');
      setVerifyMsg('Please enter a valid amount (minimum 1 USDT).');
      return;
    }

    try {
      // Create pending deposit request in Firestore & Store
      const depositReq = deposit(val, network, txHash.trim());
      if (depositReq) {
        setVerifyState('verified');
        setVerifyMsg(`Deposit request of ${val} USDT submitted! Your request has been queued for verification.`);
        setAmount('');
        setTxHash('');
      } else {
        setVerifyState('error');
        setVerifyMsg('Could not submit deposit. Please check your account login status and try again.');
      }
    } catch (err: any) {
      setVerifyState('error');
      setVerifyMsg(err?.message || 'Error submitting deposit. Please try again.');
    }
  };

  const transactions = rawTx.filter((tx) => tx && tx.type === 'deposit');
  const filteredTx = filterTab === 'all' ? transactions : transactions.filter((tx) => tx && tx.status === filterTab);

  return (
    <div className="min-h-screen pb-28" style={{ background: '#f3f5f7' }}>
      <div className="px-5 pt-5 pb-6">
        <h1 className="text-xl font-bold mb-5" style={{ color: '#1a1a1a' }}>Deposit USDT</h1>

        {/* Deposit Status Banners */}
        {verifyState === 'verified' && (
          <div className="mb-5 p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium flex items-center gap-3 shadow-sm">
            <div className="w-9 h-9 rounded-xl bg-emerald-600 flex items-center justify-center shrink-0 shadow-sm shadow-emerald-600/25">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <div>
              <p className="font-bold text-emerald-900">✓ Deposit Request Queued</p>
              <p className="text-[11px] text-emerald-700 mt-0.5">{verifyMsg}</p>
            </div>
          </div>
        )}

        {verifyState === 'error' && (
          <div className="mb-5 p-4 rounded-2xl bg-red-50 border border-red-200 text-red-800 text-xs font-medium flex items-center gap-3 shadow-sm">
            <svg className="shrink-0" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
            <div>
              <p className="font-bold text-red-900">Deposit Error</p>
              <p className="text-[11px] text-red-700 mt-0.5">{verifyMsg}</p>
            </div>
          </div>
        )}

        <div className="rounded-2xl p-5 mb-5 card-premium">
          <div className="flex flex-col items-center mb-5">
            {/* BEP20 Badge */}
            <div className="mb-3 px-3 py-1.5 rounded-full text-xs font-bold" style={{ background: 'rgba(245,158,11,0.12)', color: '#d97706', border: '1px solid rgba(245,158,11,0.25)' }}>
              BSC (Binance Smart Chain)
            </div>
            <div className="w-40 h-40 rounded-xl flex items-center justify-center mb-3 overflow-hidden" style={{ background: '#fff', border: '1px solid #f0f0f0' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/deposit-qr.jpeg" alt="BSC USDT Deposit Address QR Code" className="w-40 h-40 object-contain" />
            </div>
            <p className="text-xs mb-1" style={{ color: '#999' }}>BSC USDT Deposit Address</p>
          </div>

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

          <div className="mb-4">
            <label className="block text-xs font-medium mb-1.5" style={{ color: '#888' }}>Quick Amount</label>
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
            <label className="block text-xs font-medium mb-1.5" style={{ color: '#888' }}>Amount (USDT)</label>
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
            <label className="block text-xs font-medium mb-1.5" style={{ color: '#888' }}>
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
            <span className="text-[10px] text-slate-400 mt-1 block">
              Enter your TxID if available, or submit now and verify with admin.
            </span>
          </div>

          <button
            onClick={handleDeposit}
            disabled={!amount || parseFloat(amount) <= 0}
            className="w-full py-4 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98]"
            style={{
              background: (!amount || parseFloat(amount) <= 0) ? '#d1faeb' : '#10b981',
              color: (!amount || parseFloat(amount) <= 0) ? '#9fb8ad' : '#fff',
              boxShadow: (!amount || parseFloat(amount) <= 0) ? 'none' : '0 4px 14px rgba(16,185,129,0.3)',
              cursor: (!amount || parseFloat(amount) <= 0) ? 'not-allowed' : 'pointer',
            }}
          >
            Submit Deposit for Verification
          </button>
        </div>

        <div className="rounded-2xl p-4 card-premium">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold" style={{ color: '#1a1a1a' }}>Deposit History</span>
            <div className="flex gap-1 p-0.5 rounded-lg" style={{ background: '#f9fafb' }}>
              {(['all', 'completed', 'pending'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilterTab(f)}
                  className="px-2.5 py-1 rounded-md text-[10px] font-medium capitalize transition-all"
                  style={{
                    background: filterTab === f ? 'rgba(16,185,129,0.15)' : 'transparent',
                    color: filterTab === f ? '#10b981' : '#999',
                  }}
                >
                  {f}
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
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-semibold tabular-nums" style={{ color: '#10b981' }}>+${tx.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                    <p className="text-[10px] capitalize" style={{ color: tx.status === 'completed' ? '#10b981' : '#f59e0b' }}>{tx.status}</p>
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
