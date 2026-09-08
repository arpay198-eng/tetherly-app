'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useStore } from '@/store/useStore'

export default function AdminTransactionsPage() {
  const { transactions } = useStore()
  const [filter, setFilter] = useState<'all' | 'deposit' | 'withdrawal' | 'bonus'>('all')
  const [copiedHash, setCopiedHash] = useState<string | null>(null)

  const handleCopy = (hash: string) => {
    navigator.clipboard.writeText(hash)
    setCopiedHash(hash)
    setTimeout(() => setCopiedHash(null), 2000)
  }

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'deposit': return '#10b981'
      case 'withdrawal': return '#f59e0b'
      case 'bonus': return '#8b5cf6'
      case 'referral': return '#06b6d4'
      default: return '#6b7280'
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return '#10b981'
      case 'pending': return '#f59e0b'
      case 'failed': return '#ef4444'
      default: return '#6b7280'
    }
  }

  const filtered = filter === 'all'
    ? transactions
    : transactions.filter((t) => t.type === filter)

  const totalIn = transactions.filter((t) => t.type === 'deposit').reduce((s, t) => s + t.amount, 0)
  const totalOut = transactions.filter((t) => t.type === 'withdrawal' && t.status === 'completed').reduce((s, t) => s + Math.abs(t.amount), 0)

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">On-Chain Financial Ledger</h1>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
              {transactions.length} Total Records
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Immutable audit trail of all deposits, payout disbursements, daily rewards, and referral commissions.
          </p>
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
          {(['all', 'deposit', 'withdrawal', 'bonus'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold capitalize transition-all cursor-pointer ${
                filter === f
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {f === 'all' ? 'All Records' : `${f}s`}
            </button>
          ))}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Gross Deposits Inflow</p>
            <p className="text-2xl font-black text-emerald-600 mt-1 tabular-nums">
              +${totalIn.toLocaleString('en-US')} <span className="text-xs font-bold">USDT</span>
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">All on-chain confirmed deposits</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-black text-lg">
            ↓
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Gross Payouts Outflow</p>
            <p className="text-2xl font-black text-amber-600 mt-1 tabular-nums">
              -${totalOut.toLocaleString('en-US')} <span className="text-xs font-bold">USDT</span>
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">Completed withdrawals disbursed</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center font-black text-lg">
            ↑
          </div>
        </div>
      </div>

      {/* Desktop Table View */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                <th className="py-3.5 px-6">Entry ID / Type</th>
                <th className="py-3.5 px-4">Network</th>
                <th className="py-3.5 px-4">TXID / Hash</th>
                <th className="py-3.5 px-4">Timestamp</th>
                <th className="py-3.5 px-4 text-right">Amount</th>
                <th className="py-3.5 px-6 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-14 text-center text-slate-400">
                    No transactions recorded matching this filter.
                  </td>
                </tr>
              ) : (
                filtered.map((tx) => (
                  <tr key={tx.id} className="hover:bg-slate-50/60 transition-colors">
                    {/* ID & Type */}
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 font-bold"
                          style={{ background: `${getTypeColor(tx.type)}15`, color: getTypeColor(tx.type) }}
                        >
                          {tx.type === 'deposit' ? '↓' : tx.type === 'withdrawal' ? '↑' : '★'}
                        </div>
                        <div>
                          <p className="font-bold text-slate-900 capitalize">{tx.type}</p>
                          <span className="text-[10px] text-slate-400 font-mono">{tx.id}</span>
                        </div>
                      </div>
                    </td>

                    {/* Network */}
                    <td className="py-4 px-4 font-bold text-xs text-slate-700">
                      <span className="bg-slate-100 px-2 py-0.5 rounded-md font-mono text-[11px]">
                        {tx.network || 'BEP20'}
                      </span>
                    </td>

                    {/* TXID */}
                    <td className="py-4 px-4 font-mono text-xs text-slate-600">
                      {tx.hash ? (
                        <div className="flex items-center gap-2">
                          <span className="bg-slate-50 border border-slate-200/80 px-2.5 py-1 rounded-lg text-[11px] truncate max-w-[220px]" title={tx.hash}>
                            {tx.hash}
                          </span>
                          <button
                            onClick={() => handleCopy(tx.hash!)}
                            className="shrink-0 px-2 py-1 rounded-md text-[10px] font-sans font-bold transition-all active:scale-95 cursor-pointer bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-200"
                          >
                            {copiedHash === tx.hash ? 'Copied' : 'Copy'}
                          </button>
                        </div>
                      ) : (
                        <span className="text-slate-400 italic">Internal Settlement</span>
                      )}
                    </td>

                    {/* Date */}
                    <td className="py-4 px-4 text-slate-500 text-xs">
                      {new Date(tx.date).toLocaleString('en-US', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </td>

                    {/* Amount */}
                    <td className="py-4 px-4 text-right font-black tabular-nums text-sm">
                      <span style={{ color: tx.amount > 0 ? '#10b981' : '#f59e0b' }}>
                        {tx.amount > 0 ? '+' : ''}{Math.abs(tx.amount).toLocaleString('en-US')} USDT
                      </span>
                    </td>

                    {/* Status */}
                    <td className="py-4 px-6 text-center">
                      <span
                        className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold capitalize"
                        style={{ background: `${getStatusColor(tx.status)}15`, color: getStatusColor(tx.status) }}
                      >
                        {tx.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

