'use client'

import { useState, useEffect } from 'react'
import { useStore, AdminUserItem } from '@/store/useStore'
import { getAuthToken } from '@/lib/firebaseService'

export default function AdminUsersPage() {
  const { creditUser, debitUser, toggleUserStatus } = useStore()
  const [allUsers, setAllUsers] = useState<AdminUserItem[]>([])
  const [search, setSearch] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // Fetch users from server API on mount and every 15s
  useEffect(() => {
    let alive = true
    const load = async () => {
      const token = getAuthToken()
      if (!token) return
      try {
        const res = await fetch('/api/users', {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store'
        })
        if (res.ok && alive) {
          const data = await res.json()
          const list = Array.isArray(data) ? data : []
          setAllUsers(list)
          useStore.getState().setAllUsers(list)
        }
      } catch {}
    }
    load()
    const interval = setInterval(load, 3000)
    return () => { alive = false; clearInterval(interval) }
  }, [])

  // Credit / Debit Modal State
  const [activeUser, setActiveUser] = useState<AdminUserItem | null>(null)
  const [actionType, setActionType] = useState<'credit' | 'debit'>('credit')
  const [amountInput, setAmountInput] = useState('')
  const [noteInput, setNoteInput] = useState('')
  const [feedbackMsg, setFeedbackMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null)

  const handleCopy = (id: string) => {
    navigator.clipboard.writeText(id)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const handleOpenAction = (user: AdminUserItem, type: 'credit' | 'debit') => {
    setActiveUser(user)
    setActionType(type)
    setAmountInput('')
    setNoteInput('')
    setFeedbackMsg(null)
  }

  const handleConfirmAction = () => {
    if (!activeUser) return
    const amt = parseFloat(amountInput)
    if (isNaN(amt) || amt <= 0) {
      setFeedbackMsg({ text: 'Please enter a valid amount greater than 0.', type: 'error' })
      return
    }

    if (actionType === 'debit' && amt > activeUser.balance) {
      setFeedbackMsg({ text: `Amount exceeds user balance ($${activeUser.balance.toLocaleString()} USDT).`, type: 'error' })
      return
    }

    if (actionType === 'credit') {
      creditUser(activeUser.id, amt, noteInput.trim() || undefined)
      setFeedbackMsg({
        text: `Successfully credited $${amt.toLocaleString()} USDT to ${activeUser.name}!`,
        type: 'success',
      })
    } else {
      debitUser(activeUser.id, amt, noteInput.trim() || undefined)
      setFeedbackMsg({
        text: `Successfully debited $${amt.toLocaleString()} USDT from ${activeUser.name}!`,
        type: 'success',
      })
    }

    const newBal = actionType === 'credit'
      ? activeUser.balance + amt
      : Math.max(0, activeUser.balance - amt)

    setAllUsers((prev) =>
      prev.map((u) => (u.id === activeUser.id ? { ...u, balance: newBal } : u))
    )

    setTimeout(() => {
      setActiveUser(null)
      setFeedbackMsg(null)
    }, 1300)
  }

  const handleToggleStatus = (userId: string) => {
    toggleUserStatus(userId)
    setAllUsers((prev) =>
      prev.map((u) =>
        u.id === userId ? { ...u, status: u.status === 'active' ? 'blocked' : 'active' } : u
      )
    )
  }

  const currentAmt = parseFloat(amountInput) || 0
  const resultingBalance = activeUser
    ? actionType === 'credit'
      ? activeUser.balance + currentAmt
      : Math.max(0, activeUser.balance - currentAmt)
    : 0

  const filteredUsers = (allUsers || []).filter(
    (u) =>
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      u.id.includes(search)
  )

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">User Accounts Directory</h1>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
              {(allUsers || []).length} Registered
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Search users by UID or email, credit/debit USDT balances, or freeze suspicious accounts.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Search Input */}
          <div className="relative min-w-[260px]">
            <input
              type="text"
              placeholder="Search UID, name, email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 text-xs rounded-xl bg-slate-50 border border-slate-200 outline-none focus:border-emerald-500 shadow-sm"
            />
            <svg className="absolute left-3 top-3 text-slate-400" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </div>
        </div>
      </div>

      {/* Users Table / Desktop Grid */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                <th className="py-3.5 px-6">User Account</th>
                <th className="py-3.5 px-4">Numeric UID</th>
                <th className="py-3.5 px-4">Registration Date</th>
                <th className="py-3.5 px-4 text-right">USDT Balance</th>
                <th className="py-3.5 px-4 text-center">Account Status</th>
                <th className="py-3.5 px-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    No user accounts found matching your search.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-50/60 transition-colors">
                    {/* User */}
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center font-bold text-white text-xs shrink-0 shadow-sm">
                          {user.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-bold text-slate-900 text-sm">{user.name}</p>
                          <p className="text-[11px] text-slate-400">{user.email}</p>
                        </div>
                      </div>
                    </td>

                    {/* UID */}
                    <td className="py-4 px-4 font-mono text-xs text-slate-700">
                      <div className="flex items-center gap-2">
                        <span className="bg-slate-100 px-2 py-1 rounded-md font-bold">{user.id}</span>
                        <button
                          onClick={() => handleCopy(user.id)}
                          className="px-2 py-0.5 rounded text-[10px] font-sans font-bold transition-all active:scale-95 cursor-pointer bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-200"
                          title="Copy UID"
                        >
                          {copiedId === user.id ? 'Copied' : 'Copy'}
                        </button>
                      </div>
                    </td>

                    {/* Date */}
                    <td className="py-4 px-4 text-slate-500 text-xs">
                      {user.joinedDate}
                    </td>

                    {/* Balance */}
                    <td className="py-4 px-4 text-right font-black tabular-nums text-sm text-emerald-600">
                      ${user.balance.toLocaleString('en-US')} USDT
                    </td>

                    {/* Status */}
                    <td className="py-4 px-4 text-center">
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold capitalize ${
                          user.status === 'active'
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {user.status}
                      </span>
                    </td>

                    {/* Actions: Credit, Debit, Freeze/Unfreeze */}
                    <td className="py-4 px-6 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleOpenAction(user, 'credit')}
                          className="px-2.5 py-1.5 rounded-xl text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-all cursor-pointer flex items-center gap-1 border border-emerald-200/60 shadow-xs"
                          title="Credit USDT to user balance"
                        >
                          <span className="text-emerald-500 font-extrabold">+</span> Credit
                        </button>
                        <button
                          onClick={() => handleOpenAction(user, 'debit')}
                          className="px-2.5 py-1.5 rounded-xl text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 transition-all cursor-pointer flex items-center gap-1 border border-rose-200/60 shadow-xs"
                          title="Debit USDT from user balance"
                        >
                          <span className="text-rose-500 font-extrabold">-</span> Debit
                        </button>
                        <button
                          onClick={() => handleToggleStatus(user.id)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                            user.status === 'active'
                              ? 'text-red-700 bg-red-50 hover:bg-red-100 border border-red-200/60'
                              : 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200/60'
                          }`}
                        >
                          {user.status === 'active' ? 'Freeze' : 'Unfreeze'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Credit / Debit Modal */}
      {activeUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: 'rgba(15,23,42,0.65)', backdropFilter: 'blur(6px)' }}>
          <div className="w-full max-w-md rounded-3xl p-6 bg-white shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {actionType === 'credit' ? 'Credit User Funds' : 'Debit User Funds'}
                </h3>
                <p className="text-xs text-slate-500">
                  Target: <span className="font-semibold text-slate-800">{activeUser.name}</span> (UID: {activeUser.id})
                </p>
              </div>
              <button
                onClick={() => setActiveUser(null)}
                className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-400 hover:text-slate-700 flex items-center justify-center font-bold text-xs cursor-pointer"
              >
                ✕
              </button>
            </div>

            {feedbackMsg && (
              <div
                className={`p-3 mb-4 rounded-xl text-xs font-semibold text-center border ${
                  feedbackMsg.type === 'success'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-red-50 border-red-200 text-red-800'
                }`}
              >
                {feedbackMsg.text}
              </div>
            )}

            {/* Switch Mode Tabs */}
            <div className="flex rounded-xl p-1 mb-4 bg-slate-100">
              <button
                type="button"
                onClick={() => {
                  setActionType('credit')
                  setFeedbackMsg(null)
                }}
                className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  actionType === 'credit'
                    ? 'bg-white text-emerald-700 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                + Credit Funds (Add)
              </button>
              <button
                type="button"
                onClick={() => {
                  setActionType('debit')
                  setFeedbackMsg(null)
                }}
                className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  actionType === 'debit'
                    ? 'bg-white text-rose-700 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                - Debit Funds (Deduct)
              </button>
            </div>

            {/* Current Balance & Live Calculation Preview */}
            <div className="p-3 mb-4 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-between text-xs">
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Current Balance</span>
                <span className="font-extrabold text-slate-900 text-sm">${activeUser.balance.toLocaleString('en-US')} USDT</span>
              </div>
              <div className="text-center">
                <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">
                  {actionType === 'credit' ? '+ Credit' : '- Debit'}
                </span>
                <span
                  className={`font-extrabold text-sm ${
                    actionType === 'credit' ? 'text-emerald-600' : 'text-rose-600'
                  }`}
                >
                  {actionType === 'credit' ? '+' : '-'}${currentAmt.toLocaleString('en-US')}
                </span>
              </div>
              <div className="text-right">
                <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">New Balance</span>
                <span className="font-black text-emerald-600 text-sm">${resultingBalance.toLocaleString('en-US')} USDT</span>
              </div>
            </div>

            {/* Quick Chips */}
            <div className="mb-3">
              <label className="text-[11px] font-bold text-slate-500 block mb-1.5">Quick Presets</label>
              <div className="flex flex-wrap gap-1.5">
                {[50, 100, 500, 1000, 5000].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setAmountInput(String(preset))}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-all cursor-pointer"
                  >
                    {actionType === 'credit' ? `+$${preset}` : `-$${preset}`}
                  </button>
                ))}
                {actionType === 'debit' && (
                  <button
                    type="button"
                    onClick={() => setAmountInput(String(activeUser.balance))}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-rose-100 hover:bg-rose-200 text-rose-700 transition-all cursor-pointer"
                  >
                    All (${activeUser.balance.toLocaleString('en-US')})
                  </button>
                )}
              </div>
            </div>

            {/* Custom Amount Input */}
            <div className="mb-3">
              <label className="text-xs font-bold text-slate-700 block mb-1">
                USDT Amount to {actionType === 'credit' ? 'Credit' : 'Debit'}
              </label>
              <div className="relative">
                <input
                  type="number"
                  value={amountInput}
                  onChange={(e) => setAmountInput(e.target.value)}
                  className="w-full pl-4 pr-16 py-3 text-sm font-bold rounded-xl border border-slate-200 outline-none focus:border-emerald-500"
                  placeholder="0.00"
                  min="0"
                />
                <span className="absolute right-3.5 top-3.5 text-xs font-bold text-slate-400">
                  USDT
                </span>
              </div>
            </div>

            {/* Optional Note Input */}
            <div className="mb-5">
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Administrative Note (Optional)
              </label>
              <input
                type="text"
                value={noteInput}
                onChange={(e) => setNoteInput(e.target.value)}
                className="w-full p-2.5 text-xs rounded-xl border border-slate-200 outline-none focus:border-emerald-500"
                placeholder="e.g. Incentive bonus, deposit correction, payout recovery..."
              />
            </div>

            {/* Modal Buttons */}
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setActiveUser(null)}
                className="flex-1 py-2.5 rounded-xl text-xs font-bold bg-slate-100 text-slate-600 hover:bg-slate-200 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmAction}
                disabled={!amountInput || parseFloat(amountInput) <= 0}
                className={`flex-1 py-2.5 rounded-xl text-xs font-bold text-white transition-all active:scale-95 disabled:opacity-50 cursor-pointer shadow-md ${
                  actionType === 'credit'
                    ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20'
                    : 'bg-rose-600 hover:bg-rose-700 shadow-rose-600/20'
                }`}
              >
                {actionType === 'credit' ? 'Confirm Credit (+)' : 'Confirm Debit (-)'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
