'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useStore, DepositRequest } from '@/store/useStore'

export default function AdminDepositsPage() {
  const { depositRequests, approveDeposit, rejectDeposit } = useStore()
  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'completed' | 'rejected'>('all')
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [copiedHash, setCopiedHash] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [verifyMsg, setVerifyMsg] = useState<{ type: 'ok' | 'err' | 'info'; text: string } | null>(null)

  const runAutoVerify = async () => {
    if (verifying) return
    setVerifying(true)
    setVerifyMsg(null)
    try {
      const res = await fetch('/api/auto-verify', { cache: 'no-store' })
      const data = await res.json()
      if (data.error) {
        setVerifyMsg({ type: 'err', text: data.error })
      } else if (data.newlyMatched && data.newlyMatched.length > 0) {
        setVerifyMsg({ type: 'ok', text: `Auto-verified ${data.newlyMatched.length} pending deposit${data.newlyMatched.length > 1 ? 's' : ''} on-chain (${data.newlyMatched.map((m: any) => `$${Number(m.amount).toFixed(2)}`).join(', ')}).` })
      } else if (data.pendingCount > 0 && data.matched.length === 0) {
        setVerifyMsg({ type: 'info', text: `Checked ${data.incoming} on-chain transfers — no match found for ${data.pendingCount} pending deposit${data.pendingCount > 1 ? 's' : ''}.` })
      } else if (data.pendingCount === 0) {
        setVerifyMsg({ type: 'info', text: 'No pending deposits to verify.' })
      } else {
        setVerifyMsg({ type: 'ok', text: `${data.matched.length} deposits already auto-verified.` })
      }
    } catch (err: any) {
      setVerifyMsg({ type: 'err', text: err?.message || 'Auto-verify failed.' })
    } finally {
      setVerifying(false)
    }
  }

  const handleCopy = (hash: string) => {
    navigator.clipboard.writeText(hash)
    setCopiedHash(hash)
    setTimeout(() => setCopiedHash(null), 2000)
  }

  const handleConfirmReject = (id: string) => {
    rejectDeposit(id, rejectReason || 'Transaction hash invalid or unconfirmed on chain')
    setRejectingId(null)
    setRejectReason('')
  }

  const safeRequests = depositRequests || []

  const filteredRequests = safeRequests
    .filter((r) => (activeTab === 'all' ? true : r.status === activeTab))
    .filter((r) => {
      if (!searchQuery.trim()) return true
      const q = searchQuery.toLowerCase()
      return (
        r.id.toLowerCase().includes(q) ||
        (r.userName && r.userName.toLowerCase().includes(q)) ||
        (r.userEmail && r.userEmail.toLowerCase().includes(q)) ||
        (r.txHash && r.txHash.toLowerCase().includes(q)) ||
        (r.userId && r.userId.toLowerCase().includes(q))
      )
    })

  const pendingRequests = safeRequests.filter((r) => r.status === 'pending')
  const pendingCount = pendingRequests.length
  const pendingTotal = pendingRequests.reduce((s, r) => s + r.amount, 0)
  const completedTotal = safeRequests.filter((r) => r.status === 'completed').reduce((s, r) => s + r.amount, 0)

  const getExplorerUrl = (hash?: string) => {
    if (!hash) return null
    return `https://bscscan.com/tx/${hash}`
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">Deposits & Liquidity Verification Engine</h1>
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
            Review incoming USDT deposits, verify on-chain transaction hashes via Tronscan/BscScan, and credit user balances safely.
          </p>
        </div>

        {/* Filter Tabs */}
        <div className="flex flex-col items-stretch gap-2">
          <button
            onClick={runAutoVerify}
            disabled={verifying}
            className={`flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              verifying
                ? 'bg-slate-100 text-slate-400'
                : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/20 active:scale-[0.97]'
            }`}
          >
            {verifying ? (
              <>
                <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
                  <path d="M12 2a10 10 0 019.95 9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                </svg>
                Verifying on BscScan...
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                </svg>
                Auto-Verify on BscScan
              </>
            )}
          </button>
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
                {tab === 'all' ? 'All Deposits' : tab}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Auto-Verify Status */}
      {verifyMsg && (
        <div
          className={`p-3 px-4 rounded-xl text-xs font-medium border flex items-center gap-2.5 ${
            verifyMsg.type === 'ok'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : verifyMsg.type === 'err'
              ? 'bg-red-50 border-red-200 text-red-800'
              : 'bg-sky-50 border-sky-200 text-sky-800'
          }`}
        >
          {verifyMsg.type === 'ok' && <span className="text-emerald-600 font-bold">✓</span>}
          {verifyMsg.type === 'err' && <span className="text-red-600 font-bold">✕</span>}
          {verifyMsg.type === 'info' && <span className="text-sky-600 font-bold">i</span>}
          <span>{verifyMsg.text}</span>
        </div>
      )}

      {/* Search & Stats Bar */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="md:col-span-2 relative">
          <input
            type="text"
            placeholder="Search by User, Email, TXID or Request ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white rounded-xl border border-slate-200/80 text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-emerald-500 shadow-sm"
          />
          <svg
            className="absolute left-3.5 top-3 text-slate-400"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </div>

        <div className="bg-white p-3 px-4 rounded-xl border border-slate-200/80 shadow-sm flex items-center justify-between">
          <span className="text-[11px] font-bold text-slate-500 uppercase">Pending Inflow</span>
          <span className="text-sm font-black text-amber-600 tabular-nums">
            ${pendingTotal.toLocaleString('en-US')} <span className="text-[10px]">USDT</span>
          </span>
        </div>

        <div className="bg-white p-3 px-4 rounded-xl border border-slate-200/80 shadow-sm flex items-center justify-between">
          <span className="text-[11px] font-bold text-slate-500 uppercase">Verified Inflow</span>
          <span className="text-sm font-black text-emerald-600 tabular-nums">
            ${completedTotal.toLocaleString('en-US')} <span className="text-[10px]">USDT</span>
          </span>
        </div>
      </div>

      {/* Table View */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                <th className="py-3.5 px-6">Request ID / Network</th>
                <th className="py-3.5 px-4">User Details</th>
                <th className="py-3.5 px-4">TxID / Blockchain Hash</th>
                <th className="py-3.5 px-4">Submitted Date</th>
                <th className="py-3.5 px-4 text-right">Deposit Amount</th>
                <th className="py-3.5 px-4 text-center">Status</th>
                <th className="py-3.5 px-6 text-right">Verification Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filteredRequests.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-14 text-center text-slate-400">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 mx-auto flex items-center justify-center mb-2">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </div>
                    <p className="font-bold text-slate-700">No {activeTab} deposit requests found</p>
                    <p className="text-xs text-slate-400 mt-0.5">All deposit verification queues are up to date.</p>
                  </td>
                </tr>
              ) : (
                filteredRequests.map((req) => {
                  const explorerUrl = getExplorerUrl(req.txHash)

                  return (
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

                      {/* User Details */}
                      <td className="py-4 px-4">
                        <p className="font-bold text-slate-900">{req.userName || 'Account'}</p>
                        <p className="text-[11px] text-slate-400 truncate max-w-[180px]">{req.userEmail || req.userId || 'User'}</p>
                      </td>

                      {/* TxID & Blockchain Link */}
                      <td className="py-4 px-4 font-mono text-xs text-slate-700">
                        {req.autoMatchedHash ? (
                          <div className="flex items-center gap-2">
                            <span className="bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-lg text-[11px] truncate max-w-[200px] text-emerald-800" title={req.autoMatchedHash}>
                              {req.autoMatchedHash}
                            </span>
                            <button
                              onClick={() => handleCopy(req.autoMatchedHash!)}
                              className="shrink-0 px-2 py-1 rounded-md text-[10px] font-sans font-bold transition-all active:scale-95 cursor-pointer bg-emerald-100 hover:bg-emerald-200 text-emerald-700 border border-emerald-200"
                            >
                              {copiedHash === req.autoMatchedHash ? 'Copied' : 'Copy'}
                            </button>
                            {req.autoMatchedHash && (
                              <a
                                href={getExplorerUrl(req.autoMatchedHash!) ?? undefined}
                                target="_blank"
                                rel="noreferrer"
                                className="shrink-0 p-1 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded"
                                title="Check on BscScan"
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
                                  <polyline points="15 3 21 3 21 9" />
                                  <line x1="10" y1="14" x2="21" y2="3" />
                                </svg>
                              </a>
                            )}
                          </div>
                        ) : req.txHash ? (
                          <div className="flex items-center gap-2">
                            <span className="bg-slate-50 border border-slate-200/80 px-2 py-1 rounded-lg text-[11px] truncate max-w-[200px]" title={req.txHash}>
                              {req.txHash}
                            </span>
                            <button
                              onClick={() => handleCopy(req.txHash!)}
                              className="shrink-0 px-2 py-1 rounded-md text-[10px] font-sans font-bold transition-all active:scale-95 cursor-pointer bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-200"
                            >
                              {copiedHash === req.txHash ? 'Copied' : 'Copy'}
                            </button>
                            {explorerUrl && (
                              <a
                                href={explorerUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="shrink-0 p-1 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded"
                                title="Check on BscScan"
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
                                  <polyline points="15 3 21 3 21 9" />
                                  <line x1="10" y1="14" x2="21" y2="3" />
                                </svg>
                              </a>
                            )}
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-400 italic">No Hash Provided</span>
                        )}
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
                        +${req.amount.toLocaleString('en-US')} <span className="text-xs font-bold text-emerald-600">USDT</span>
                      </td>

                      {/* Status */}
                      <td className="py-4 px-4 text-center">
                        <div className="flex flex-col items-center gap-1">
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
                          {req.autoVerified && (
                            <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-600 text-white shadow-sm">
                              ⚡ Auto-Matched
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-4 px-6 text-right">
                        {req.status === 'pending' ? (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => approveDeposit(req.id)}
                              className="px-3.5 py-1.5 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition-all active:scale-95 cursor-pointer shadow-md shadow-emerald-600/20"
                            >
                              ✓ Approve & Credit
                            </button>
                            <button
                              onClick={() => setRejectingId(req.id)}
                              className="px-3 py-1.5 rounded-xl text-xs font-bold text-red-700 bg-red-50 hover:bg-red-100 transition-all cursor-pointer"
                            >
                              Reject
                            </button>
                          </div>
                        ) : (
                          <div className="text-right">
                            <span className="text-[11px] text-slate-400 font-medium">
                              {req.status === 'completed' ? '✓ Balance Credited' : 'Rejected'}
                            </span>
                            {req.rejectReason && (
                              <p className="text-[10px] text-red-500 truncate max-w-[150px]" title={req.rejectReason}>
                                {req.rejectReason}
                              </p>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Reject Confirmation Modal */}
      {rejectingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(6px)' }}>
          <div className="w-full max-w-sm rounded-3xl p-6 bg-white shadow-2xl border border-slate-100">
            <h3 className="text-base font-bold text-slate-900 mb-1">Reject Deposit Request?</h3>
            <p className="text-xs text-slate-500 mb-4">The deposit request will be marked as rejected. No balance will be credited to the user.</p>
            <input
              type="text"
              placeholder="Reason (e.g. TxID unconfirmed or invalid amount)"
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
