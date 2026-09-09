'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useStore, WithdrawalRequest } from '@/store/useStore'
import { getAuthToken } from '@/lib/firebaseService'

export default function AdminWithdrawalsPage() {
  const { approveWithdrawal, rejectWithdrawal } = useStore()
  const [withdrawalRequests, setWithdrawalRequests] = useState<WithdrawalRequest[]>([])
  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'completed' | 'rejected'>('all')
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [copiedAddr, setCopiedAddr] = useState<string | null>(null)

  // Fetch withdrawals from server API on mount and every 15s
  useEffect(() => {
    let alive = true
    const load = async () => {
      const token = getAuthToken()
      if (!token) return
      try {
        const res = await fetch('/api/withdrawals', {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store'
        })
        if (res.ok && alive) {
          const data = await res.json()
          setWithdrawalRequests(Array.isArray(data) ? data : [])
        }
      } catch {}
    }
    load()
    const interval = setInterval(load, 3000)
    return () => { alive = false; clearInterval(interval) }
  }, [])

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return '#10b981'
      case 'pending': return '#f59e0b'
      case 'processing': return '#06b6d4'
      case 'rejected': return '#ef4444'
      default: return '#6b7280'
    }
  }

  const handleCopy = (addr: string) => {
    navigator.clipboard.writeText(addr)
    setCopiedAddr(addr)
    setTimeout(() => setCopiedAddr(null), 2000)
  }

  const handleConfirmReject = (id: string) => {
    rejectWithdrawal(id, rejectReason || 'Address or KYC verification failed')
    setRejectingId(null)
    setRejectReason('')
  }

  const filteredRequests = activeTab === 'all'
    ? withdrawalRequests
    : withdrawalRequests.filter((r) => r.status === activeTab)

  const pendingCount = (withdrawalRequests || []).filter((r) => r.status === 'pending').length
  const pendingTotal = (withdrawalRequests || []).filter((r) => r.status === 'pending').reduce((s, r) => s + r.amount, 0)

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">Withdrawals & Settlement Engine</h1>
            {pendingCount > 0 ? (
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 animate-pulse">
                {pendingCount} Pending (${pendingTotal.toLocaleString('en-US')} USDT)
              </span>
            ) : (
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                Queue Clear
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Review destination wallet addresses, broadcast transaction hashes, and approve on-chain USDT payouts.
          </p>
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
          {(['all', 'pending', 'completed', 'rejected'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold capitalize transition-all cursor-pointer ${
                activeTab === tab
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {tab === 'all' ? 'All Requests' : tab}
            </button>
          ))}
        </div>
      </div>

      {/* Desktop Table View */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                <th className="py-3.5 px-6">Request ID / Network</th>
                <th className="py-3.5 px-4">Destination Address</th>
                <th className="py-3.5 px-4">Requested Date</th>
                <th className="py-3.5 px-4 text-right">Amount</th>
                <th className="py-3.5 px-4 text-center">Status</th>
                <th className="py-3.5 px-6 text-right">Settlement Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filteredRequests.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-14 text-center text-slate-400">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 mx-auto flex items-center justify-center mb-2">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </div>
                    <p className="font-bold text-slate-700">No {activeTab} withdrawal requests</p>
                    <p className="text-xs text-slate-400 mt-0.5">All payout queues are up to date.</p>
                  </td>
                </tr>
              ) : (
                filteredRequests.map((req) => (
                  <tr key={req.id} className="hover:bg-slate-50/60 transition-colors">
                    {/* ID & Network */}
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-2.5">
                        <span
className="w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs bg-amber-50 text-amber-600 border border-amber-100"
                        >
                          BSC
                        </span>
                        <div>
                          <p className="font-bold text-slate-900">{req.id}</p>
                          <span className="text-[10px] text-slate-400 font-mono">{req.network}</span>
                        </div>
                      </div>
                    </td>

                    {/* Destination Address */}
                    <td className="py-4 px-4 font-mono text-xs text-slate-700">
                      <div className="flex items-center gap-2">
                        <span className="bg-slate-50 border border-slate-200/80 px-2.5 py-1 rounded-lg text-[11px] truncate max-w-[260px]" title={req.address}>
                          {req.address}
                        </span>
                        <button
                          onClick={() => handleCopy(req.address)}
                          className="shrink-0 px-2 py-1 rounded-md text-[10px] font-sans font-bold transition-all active:scale-95 cursor-pointer bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-200"
                        >
                          {copiedAddr === req.address ? 'Copied' : 'Copy'}
                        </button>
                      </div>
                    </td>

                    {/* Date */}
                    <td className="py-4 px-4 text-slate-500 text-xs">
                      {new Date(req.date).toLocaleString('en-US', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </td>

                    {/* Amount */}
                    <td className="py-4 px-4 text-right font-black tabular-nums text-sm text-slate-900">
                      ${req.amount.toLocaleString('en-US')} <span className="text-xs font-bold text-emerald-600">USDT</span>
                    </td>

                    {/* Status */}
                    <td className="py-4 px-4 text-center">
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold capitalize ${
                          req.status === 'completed'
                            ? 'bg-emerald-100 text-emerald-700'
                            : req.status === 'pending'
                            ? 'bg-amber-100 text-amber-800 animate-pulse'
                            : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {req.status}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="py-4 px-6 text-right">
                      {req.status === 'pending' ? (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => approveWithdrawal(req.id)}
                            className="px-3.5 py-1.5 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition-all active:scale-95 cursor-pointer shadow-md shadow-emerald-600/20"
                          >
                            ✓ Approve
                          </button>
                          <button
                            onClick={() => setRejectingId(req.id)}
                            className="px-3 py-1.5 rounded-xl text-xs font-bold text-red-700 bg-red-50 hover:bg-red-100 transition-all cursor-pointer"
                          >
                            Reject
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400 font-medium">Archived</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Reject Confirmation Modal */}
      {rejectingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(6px)' }}>
          <div className="w-full max-w-sm rounded-3xl p-6 bg-white shadow-2xl border border-slate-100">
            <h3 className="text-base font-bold text-slate-900 mb-1">Reject Withdrawal?</h3>
            <p className="text-xs text-slate-500 mb-4">The requested USDT will be refunded immediately back to the user wallet.</p>
            <input
              type="text"
              placeholder="Rejection reason (e.g. Invalid address format)"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="w-full p-3 text-xs rounded-xl border border-slate-200 mb-4 outline-none focus:border-emerald-500"
            />
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setRejectingId(null); setRejectReason(''); }}
                className="flex-1 py-2.5 rounded-xl text-xs font-bold bg-slate-100 text-slate-600 hover:bg-slate-200 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => handleConfirmReject(rejectingId)}
                className="flex-1 py-2.5 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-700 text-white cursor-pointer shadow-md shadow-red-600/20"
              >
                Confirm Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
