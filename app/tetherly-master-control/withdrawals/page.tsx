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
  const [approvingId, setApprovingId] = useState<string | null>(null)
  const [approveHash, setApproveHash] = useState('')
  const [copiedAddr, setCopiedAddr] = useState<string | null>(null)

  const [authError, setAuthError] = useState(false)

  // Fetch withdrawals from server API on mount and every 3s
  useEffect(() => {
    let alive = true
    const load = async () => {
      const token = getAuthToken()
      if (!token) {
        if (alive) setAuthError(true)
        return
      }
      try {
        const res = await fetch('/api/withdrawals', {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store'
        })
        if (res.ok && alive) {
          setAuthError(false)
          const data = await res.json()
          const list = Array.isArray(data) ? data : []
          setWithdrawalRequests(list)
          useStore.getState().setWithdrawalRequests(list)
        } else if ((res.status === 401 || res.status === 403) && alive) {
          setAuthError(true)
        }
      } catch {
        // network retry handled by interval
      }
    }
    load()
    const interval = setInterval(load, 12000)
    return () => { alive = false; clearInterval(interval) }
  }, [])

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return '#10b981'
      case 'pending': return '#f59e0b'
      case 'processing': return '#06b6d4'
      case 'rejected':
      case 'failed': return '#ef4444'
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

  const handleConfirmApprove = (id: string) => {
    approveWithdrawal(id, approveHash.trim() || undefined)
    setApprovingId(null)
    setApproveHash('')
  }

  const safeRequests = withdrawalRequests || []
  const pendingRequests = safeRequests.filter((r) => r.status === 'pending')
  const pendingCount = pendingRequests.length
  const completedCount = safeRequests.filter((r) => r.status === 'completed').length
  const rejectedCount = safeRequests.filter((r) => r.status === 'rejected' || r.status === 'failed').length
  const allCount = safeRequests.length

  const filteredRequests = safeRequests.filter((r) => {
    if (activeTab === 'all') return true
    if (activeTab === 'rejected') return r.status === 'rejected' || r.status === 'failed'
    return r.status === activeTab
  })

  const pendingTotal = pendingRequests.reduce((s, r) => s + r.amount, 0)

  const tabList = [
    { key: 'all', label: 'All Requests', count: allCount },
    { key: 'pending', label: 'Pending', count: pendingCount },
    { key: 'completed', label: 'Completed', count: completedCount },
    { key: 'rejected', label: 'Rejected', count: rejectedCount },
  ] as const

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
                Queue Clear ({allCount} Total)
              </span>
            )}
          </div>
          <p className="text-xs font-medium text-slate-500 mt-1">
            Review destination wallet addresses, broadcast transaction hashes, and approve on-chain USDT payouts.
          </p>
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
          {tabList.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition-all cursor-pointer ${
                activeTab === tab.key
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                  tab.key === 'pending' && tab.count > 0
                    ? 'bg-amber-100 text-amber-800 animate-pulse'
                    : activeTab === tab.key
                    ? 'bg-slate-100 text-slate-700'
                    : 'bg-slate-200/70 text-slate-500'
                }`}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {authError && (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-medium flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2.5">
            <span className="text-amber-600 font-bold text-base">⚠️</span>
            <span>Admin session expired or missing authentication token. Please re-unlock the Master Control panel.</span>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="px-3 py-1 bg-amber-600 text-white rounded-lg font-bold text-xs hover:bg-amber-700 cursor-pointer"
          >
            Refresh
          </button>
        </div>
      )}

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
                    {activeTab === 'pending' && safeRequests.length > 0 ? (
                      <div className="mt-2">
                        <p className="text-xs text-slate-500">
                          Pending queue is completely clear. You have {allCount} total processed withdrawal requests.
                        </p>
                        <button
                          onClick={() => setActiveTab('all')}
                          className="mt-3 px-4 py-1.5 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 transition-all cursor-pointer shadow-sm"
                        >
                          View All Requests ({allCount})
                        </button>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400 mt-0.5">All payout queues are up to date.</p>
                    )}
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
                            onClick={() => setApprovingId(req.id)}
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

      {/* Approve Confirmation Modal */}
      {approvingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(6px)' }}>
          <div className="w-full max-w-sm rounded-3xl p-6 bg-white shadow-2xl border border-slate-100">
            <h3 className="text-base font-bold text-slate-900 mb-1">Approve Withdrawal?</h3>
            <p className="text-xs text-slate-500 mb-4">You can optionally provide the blockchain Transaction ID (TxID) to help the user track their payment.</p>
            <input
              type="text"
              placeholder="Transaction ID (TxID) - Optional"
              value={approveHash}
              onChange={(e) => setApproveHash(e.target.value)}
              className="w-full px-4 py-2.5 text-xs rounded-xl bg-slate-50 border border-slate-200 outline-none focus:border-emerald-500 shadow-sm mb-5"
            />
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setApprovingId(null)
                  setApproveHash('')
                }}
                className="flex-1 py-2.5 rounded-xl text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleConfirmApprove(approvingId)}
                className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-md shadow-emerald-600/20 transition-all active:scale-95"
              >
                Confirm Approval
              </button>
            </div>
          </div>
        </div>
      )}

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
