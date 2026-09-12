'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/store/useStore';
import MobileNav from '@/components/layout/MobileNav';
import { Gift } from 'lucide-react';

export default function TransactionsPage() {
  const router = useRouter();
  const isLoggedIn = useStore((s) => s.isLoggedIn);
  const transactions = useStore((s) => s.transactions);
  const user = useStore((s) => s.user);
  const refreshUser = useStore((s) => s.refreshUser);
  const [filter, setFilter] = useState<'all' | 'deposit' | 'withdrawal' | 'bonus'>('all');

  useEffect(() => {
    if (!isLoggedIn) router.replace('/auth/login');
    void refreshUser();
    const interval = setInterval(() => {
      void refreshUser();
    }, 5000);
    return () => clearInterval(interval);
  }, [isLoggedIn, router, refreshUser]);

  if (!isLoggedIn) return null;

  const txList = transactions || [];
  const filtered = (filter === 'all' ? txList : txList.filter((tx) => tx.type === filter))
    .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());

  const getIcon = (type: string) => {
    switch (type) {
      case 'deposit':
        return (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 1v22" /><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
          </svg>
        );
      case 'withdrawal':
        return (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" />
          </svg>
        );
      case 'bonus':
        return (
          <Gift size={18} color="#8b5cf6" strokeWidth={2.5} />
        );
      case 'referral':
        return (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" />
          </svg>
        );
      default:
        return (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2">
            <circle cx="12" cy="12" r="10" /><path d="M12 8v4l3 3" />
          </svg>
        );
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'deposit': return 'rgba(16,185,129,0.1)';
      case 'withdrawal': return 'rgba(245,158,11,0.1)';
      case 'bonus': return 'rgba(139,92,246,0.1)';
      case 'referral': return 'rgba(6,182,212,0.1)';
      default: return '#f9fafb';
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

  const tabs = [
    { key: 'all', label: 'All' },
    { key: 'deposit', label: 'Deposits' },
    { key: 'withdrawal', label: 'Withdrawals' },
    { key: 'bonus', label: 'Bonuses' },
  ] as const;

  return (
    <div className="min-h-screen pb-28" style={{ background: '#f3f5f7' }}>
      <div className="px-5 pt-5 pb-6">
        <h1 className="text-xl font-bold mb-5" style={{ color: '#1a1a1a' }}>Transactions</h1>

        <div className="flex gap-1.5 p-1 rounded-xl mb-5 overflow-x-auto no-scrollbar" style={{ background: '#f9fafb', border: '1px solid #f0f0f0' }}>
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className="flex-none px-3.5 py-2 rounded-lg text-xs font-medium transition-all whitespace-nowrap"
              style={{
                background: filter === tab.key ? 'rgba(16,185,129,0.15)' : 'transparent',
                color: filter === tab.key ? '#10b981' : '#999',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-12">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-3">
              <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
              <line x1="1" y1="10" x2="23" y2="10" />
            </svg>
            <p className="text-sm" style={{ color: '#bbb' }}>No transactions found</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {filtered.map((tx) => (
              <div key={tx.id} className="flex items-center gap-3 p-4 rounded-xl card-premium">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: getTypeColor(tx.type) }}>
                  {getIcon(tx.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="text-sm font-medium" style={{ color: '#1a1a1a' }}>
                      {tx.type.charAt(0).toUpperCase() + tx.type.slice(1)}
                    </p>
                    {tx.network && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded font-medium" style={{ background: '#f3f4f6', color: '#888' }}>
                        {tx.network}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] font-medium" style={{ color: '#999' }}>
                    {new Date(tx.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </p>
                  {tx.hash && tx.status === 'completed' && !tx.hash.startsWith('TX_') && !tx.hash.startsWith('0x_wd_') && !tx.hash.startsWith('ADMIN_DEBIT_') && !tx.hash.startsWith('ADMIN_CREDIT_') && (
                    <div className="flex items-center gap-1 mt-1">
                      <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-mono truncate max-w-[180px]" title={tx.hash}>
                        TxID: {tx.hash}
                      </span>
                      <button 
                        onClick={() => navigator.clipboard.writeText(tx.hash!)}
                        className="text-[10px] text-emerald-600 font-bold hover:underline"
                      >
                        Copy
                      </button>
                    </div>
                  )}
                  {tx.rejectReason && tx.status === 'failed' && (
                    <p className="text-[10px] text-red-500 truncate" title={tx.rejectReason}>
                      Reason: {tx.rejectReason}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold tabular-nums" style={{ color: tx.amount >= 0 ? '#10b981' : '#f87171' }}>
                    {tx.amount >= 0 ? '+' : ''}{Math.abs(tx.amount).toLocaleString('en-US')}
                  </p>
                  <p className="text-[10px] capitalize font-bold" style={{ color: getStatusColor(tx.status) }}>
                    {tx.status === 'failed' ? 'Rejected' : tx.status}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <MobileNav />
    </div>
  );
}
