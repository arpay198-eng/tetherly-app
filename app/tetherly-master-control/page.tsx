'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useStore, AdminUserItem, Transaction, DepositRequest, WithdrawalRequest } from '@/store/useStore'
import { getAuthToken } from '@/lib/firebaseService'

export default function MasterControlPage() {
  const router = useRouter()
  const { updateUserBalance, creditUser, debitUser, approveWithdrawal, approveDeposit, toggleUserStatus } = useStore()
  const [allUsers, setAllUsers] = useState<AdminUserItem[]>([])
  const [depositRequests, setDepositRequests] = useState<DepositRequest[]>([])
  const [withdrawalRequests, setWithdrawalRequests] = useState<WithdrawalRequest[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [authError, setAuthError] = useState(false)

  // Fetch all data from server API on mount and every 3s
  useEffect(() => {
    let alive = true
    const load = async () => {
      const token = getAuthToken()
      if (!token) {
        if (alive) setAuthError(true)
        return
      }
      const headers = { Authorization: `Bearer ${token}` }
      try {
        const [uRes, dRes, wRes, tRes] = await Promise.all([
          fetch('/api/users', { headers, cache: 'no-store' }),
          fetch('/api/deposits', { headers, cache: 'no-store' }),
          fetch('/api/withdrawals', { headers, cache: 'no-store' }),
          fetch('/api/transactions', { headers, cache: 'no-store' }),
        ])
        if (uRes.status === 401 || uRes.status === 403 || dRes.status === 401 || dRes.status === 403) {
          if (alive) setAuthError(true)
          return
        }
        if (alive) setAuthError(false)

        if (uRes.ok && alive) {
          const u = await uRes.json();
          const list = Array.isArray(u) ? u : [];
          setAllUsers(list);
          useStore.getState().setAllUsers(list);
        }
        if (dRes.ok && alive) {
          const d = await dRes.json();
          const list = Array.isArray(d) ? d : [];
          setDepositRequests(list);
          useStore.getState().setDepositRequests(list);
        }
        if (wRes.ok && alive) {
          const w = await wRes.json();
          const list = Array.isArray(w) ? w : [];
          setWithdrawalRequests(list);
          useStore.getState().setWithdrawalRequests(list);
        }
        if (tRes.ok && alive) {
          const t = await tRes.json();
          const list = Array.isArray(t) ? t : [];
          setTransactions(list);
          useStore.getState().setTransactions(list);
        }
      } catch {
        // network retry handled by interval
      }
    }
    load()
    const interval = setInterval(load, 12000)
    return () => { alive = false; clearInterval(interval) }
  }, [])

  // Quick adjust modal state
  const [showQuickCreditModal, setShowQuickCreditModal] = useState(false)
  const [selectedUserId, setSelectedUserId] = useState('')
  const [modalUserSearch, setModalUserSearch] = useState('')
  const [creditAmount, setCreditAmount] = useState('')
  const [creditType, setCreditType] = useState<'credit' | 'debit'>('credit')
  const [creditSuccessMsg, setCreditSuccessMsg] = useState('')
  const [quickApprovedId, setQuickApprovedId] = useState<string | null>(null)
  const [tableFilter, setTableFilter] = useState<'all' | 'deposit' | 'withdrawal' | 'bonus'>('all')
  const [userSearch, setUserSearch] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // Calculations
  const safeWithdrawals = withdrawalRequests || []
  const safeDeposits = depositRequests || []
  const safeTransactions = transactions || []
  const safeUsers = allUsers || []

  const selectedUser = safeUsers.find((u) => u.id === selectedUserId)
  const currentCreditAmt = parseFloat(creditAmount) || 0
  const previewNewBalance = selectedUser
    ? creditType === 'credit'
      ? selectedUser.balance + currentCreditAmt
      : Math.max(0, selectedUser.balance - currentCreditAmt)
    : 0

  const filteredModalUsers = safeUsers.filter(
    (u) =>
      u.name.toLowerCase().includes(modalUserSearch.toLowerCase()) ||
      u.email.toLowerCase().includes(modalUserSearch.toLowerCase()) ||
      u.id.includes(modalUserSearch)
  )

  const pendingWithdrawals = safeWithdrawals.filter((r) => r.status === 'pending')
  const pendingAmount = pendingWithdrawals.reduce((sum, r) => sum + r.amount, 0)
  const pendingDeposits = safeDeposits.filter((r) => r.status === 'pending')
  const pendingDepositAmount = pendingDeposits.reduce((sum, r) => sum + r.amount, 0)
  const totalUserBalance = safeUsers.reduce((sum, u) => sum + (u.balance || 0), 0)
  const activeUsers = safeUsers.filter((u) => u.status === 'active').length
  const blockedUsers = safeUsers.filter((u) => u.status === 'blocked').length

  const totalDeposits = safeTransactions
    .filter((t) => t.type === 'deposit')
    .reduce((sum, t) => sum + t.amount, 0)

  const completedPayouts = safeTransactions
    .filter((t) => t.type === 'withdrawal' && t.status === 'completed')
    .reduce((sum, t) => sum + Math.abs(t.amount), 0)

  // Platform Vault Reserves
  const platformReserves = 150000 + totalDeposits - completedPayouts

  // De-duplicate transactions against explicit deposit requests & withdrawal requests
  const existingDepHashes = new Set(safeDeposits.map((d) => (d.txHash || '').toLowerCase()).filter(Boolean))
  const existingDepIds = new Set(safeDeposits.map((d) => d.id))
  const existingWdIds = new Set(safeWithdrawals.map((w) => w.id))

  const uniqueTransactions = safeTransactions.filter((t) => {
    if (t.type === 'deposit') {
      if (t.hash && existingDepHashes.has(t.hash.toLowerCase())) return false
      if (t.id && existingDepIds.has(t.id.replace(/^tx_/, ''))) return false
    }
    if (t.type === 'withdrawal') {
      if (t.id && existingWdIds.has(t.id.replace(/^tx_/, ''))) return false
      if (t.hash && existingWdIds.has(t.hash)) return false
    }
    return true
  })

  // Combined ledger items
  const ledgerItems = [
    ...safeWithdrawals.map((w) => ({
      id: w.id,
      type: 'withdrawal',
      network: w.network,
      label: `Withdrawal Request (${w.network})`,
      detail: w.address,
      amount: -w.amount,
      status: w.status === 'failed' ? 'rejected' : w.status,
      date: w.date,
      isWithdrawal: true,
      raw: w,
    })),
    ...safeDeposits.map((d) => ({
      id: d.id,
      type: 'deposit',
      network: d.network || 'BEP20',
      label: `Deposit Request (${d.network || 'BEP20'})`,
      detail: d.txHash || d.id,
      amount: d.amount,
      status: d.status === 'failed' ? 'rejected' : d.status,
      date: d.date,
      isWithdrawal: false,
      raw: d,
    })),
    ...uniqueTransactions.map((t) => ({
      id: t.id,
      type: t.type,
      network: t.network || 'BSC',
      label: `${t.type.charAt(0).toUpperCase() + t.type.slice(1)} (${t.network || 'BSC'})`,
      detail: t.hash || 'Internal Settlement',
      amount: t.amount,
      status: t.status,
      date: t.date,
      isWithdrawal: false,
      raw: null,
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  const filteredLedger = tableFilter === 'all'
    ? ledgerItems
    : ledgerItems.filter((item) => item.type === tableFilter)

  const filteredUsers = safeUsers.filter(
    (u) =>
      u.name.toLowerCase().includes(userSearch.toLowerCase()) ||
      u.email.toLowerCase().includes(userSearch.toLowerCase()) ||
      u.id.includes(userSearch)
  )

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopiedId(text)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const handleQuickCredit = () => {
    const target = safeUsers.find((u) => u.id === selectedUserId)
    if (!target) return
    const amt = parseFloat(creditAmount)
    if (isNaN(amt) || amt <= 0) return

    if (creditType === 'credit') {
      creditUser(target.id, amt)
      setCreditSuccessMsg(`Successfully credited $${amt.toLocaleString()} USDT to ${target.name}!`)
    } else {
      if (amt > target.balance) {
        setCreditSuccessMsg(`Error: Amount exceeds ${target.name}'s balance ($${target.balance.toLocaleString()} USDT).`)
        return
      }
      debitUser(target.id, amt)
      setCreditSuccessMsg(`Successfully debited $${amt.toLocaleString()} USDT from ${target.name}!`)
    }

    setTimeout(() => {
      setCreditSuccessMsg('')
      setShowQuickCreditModal(false)
      setCreditAmount('')
    }, 1400)
  }

  const handleQuickApprove = (reqId: string) => {
    approveWithdrawal(reqId)
    setQuickApprovedId(reqId)
    setTimeout(() => setQuickApprovedId(null), 2500)
  }

  const openActionForUser = (userId: string, type: 'credit' | 'debit' = 'credit') => {
    setSelectedUserId(userId)
    setCreditType(type)
    setShowQuickCreditModal(true)
  }

  return (
    <div className="space-y-6" suppressHydrationWarning>
      {/* Top Banner / Welcome Action Row */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">Platform Command Center</h1>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
              Live Mainnet
            </span>
          </div>
          <p className="text-xs font-medium text-slate-500 mt-1">
            Real-time management of platform liquidity, user reserves, and on-chain withdrawal settlements.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            onClick={() => setShowQuickCreditModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-white shadow-md shadow-emerald-600/20 hover:shadow-lg transition-all active:scale-95 cursor-pointer"
            style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)' }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span>Credit User Balance</span>
          </button>

          <Link
            href="/tetherly-master-control/deposits"
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-all active:scale-95 cursor-pointer"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22V8M5 15l7-7 7 7" />
              <path d="M2 7V5a2 2 0 012-2h16a2 2 0 012 2v2" />
            </svg>
            <span>Review Deposits</span>
            {pendingDeposits.length > 0 && (
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            )}
          </Link>

          <Link
            href="/tetherly-master-control/withdrawals"
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-all active:scale-95 cursor-pointer"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2v14M19 9l-7 7-7-7" />
              <path d="M2 17v2a2 2 0 002 2h16a2 2 0 002-2v-2" />
            </svg>
            <span>Review Payouts</span>
            {pendingWithdrawals.length > 0 && (
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            )}
          </Link>
        </div>
      </div>

      {authError && (
        <div className="rounded-2xl p-4 px-5 bg-amber-50 border border-amber-200 text-amber-900 text-xs font-medium flex items-center justify-between shadow-sm">
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

      {/* Reassuring Queue Status Bar when queue is clear */}
      {pendingDeposits.length === 0 && pendingWithdrawals.length === 0 && (
        <div className="rounded-2xl p-4 px-5 bg-white border border-slate-200/80 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold text-sm shrink-0">
              ✓
            </div>
            <div>
              <p className="text-xs font-bold text-slate-800">
                All Verification Queues are Up-To-Date
              </p>
              <p className="text-[11px] text-slate-400">
                0 pending deposits &bull; 0 pending withdrawals &bull; {safeDeposits.length} deposits recorded &bull; {safeWithdrawals.length} withdrawals recorded
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link
              href="/tetherly-master-control/deposits"
              className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 transition-colors"
            >
              All Deposits ({safeDeposits.length})
            </Link>
            <Link
              href="/tetherly-master-control/withdrawals"
              className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 transition-colors"
            >
              All Withdrawals ({safeWithdrawals.length})
            </Link>
          </div>
        </div>
      )}

      {/* Dynamic Pending Deposits Alert Banner */}
      {pendingDeposits.length > 0 && (
        <div className="rounded-2xl p-5 bg-gradient-to-r from-emerald-50 via-teal-50/80 to-emerald-50 border border-emerald-300/80 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-emerald-600/20">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22V8M5 15l7-7 7 7" />
                <path d="M2 7V5a2 2 0 012-2h16a2 2 0 012 2v2" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-emerald-950">
                  {pendingDeposits.length} Deposit Request{pendingDeposits.length > 1 ? 's' : ''} Awaiting On-Chain Verification
                </h3>
                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-200 text-emerald-900 uppercase">
                  Verify TxID
                </span>
              </div>
              <p className="text-xs text-emerald-800 mt-1">
                Total incoming deposit queue: <strong className="font-bold">${pendingDepositAmount.toLocaleString('en-US')} USDT</strong>. First in queue:{' '}
                <span className="font-medium text-[11px] bg-white/70 px-1.5 py-0.5 rounded">
                  {pendingDeposits[0]?.userName || pendingDeposits[0]?.userEmail || 'User'}
                </span>{' '}
                (+${pendingDeposits[0]?.amount} USDT on {pendingDeposits[0]?.network})
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              onClick={() => approveDeposit(pendingDeposits[0].id)}
              className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition-all active:scale-95 cursor-pointer shadow-sm"
            >
              ✓ Approve First
            </button>
            <Link
              href="/tetherly-master-control/deposits"
              className="px-4 py-2 rounded-xl text-xs font-bold text-emerald-900 bg-emerald-100 hover:bg-emerald-200 transition-all active:scale-95 cursor-pointer"
            >
              Verify Full Queue →
            </Link>
          </div>
        </div>
      )}

      {/* Dynamic Pending Alert Banner */}
      {pendingWithdrawals.length > 0 && (
        <div className="rounded-2xl p-5 bg-gradient-to-r from-amber-50 via-amber-100/60 to-amber-50 border border-amber-300/80 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-md shadow-amber-500/20">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-amber-950">
                  {pendingWithdrawals.length} Withdrawal Request{pendingWithdrawals.length > 1 ? 's' : ''} Awaiting Admin Approval
                </h3>
                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-amber-200 text-amber-900 uppercase">
                  Action Needed
                </span>
              </div>
              <p className="text-xs text-amber-800 mt-1">
                Total payout queue: <strong className="font-bold">${pendingAmount.toLocaleString('en-US')} USDT</strong>. First in queue:{' '}
                <span className="font-mono text-[11px] bg-white/70 px-1.5 py-0.5 rounded">
                  {pendingWithdrawals[0]?.address.slice(0, 8)}...{pendingWithdrawals[0]?.address.slice(-6)}
                </span>{' '}
                ({pendingWithdrawals[0]?.amount} USDT on {pendingWithdrawals[0]?.network})
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              onClick={() => handleQuickApprove(pendingWithdrawals[0].id)}
              disabled={quickApprovedId === pendingWithdrawals[0].id}
              className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition-all active:scale-95 disabled:opacity-50 cursor-pointer shadow-sm"
            >
              {quickApprovedId === pendingWithdrawals[0].id ? '✓ Approved!' : '✓ Approve First'}
            </button>
            <Link
              href="/tetherly-master-control/withdrawals"
              className="px-4 py-2 rounded-xl text-xs font-bold text-amber-900 bg-amber-200 hover:bg-amber-300 transition-all active:scale-95 cursor-pointer"
            >
              View Full Queue →
            </Link>
          </div>
        </div>
      )}

      {/* Row 1: 4-Column High-Impact KPI Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* KPI 1: Platform Vault Reserves */}
        <div className="relative rounded-2xl p-5 bg-gradient-to-br from-[#0b1329] via-[#111c38] to-[#0d1527] text-white border border-emerald-500/25 shadow-md flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">
              Platform Reserves
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              100% Solvency
            </span>
          </div>
          <div>
            <h2 className="text-2xl font-black tracking-tight text-white tabular-nums">
              ${platformReserves.toLocaleString('en-US')}{' '}
              <span className="text-xs font-bold text-emerald-400">USDT</span>
            </h2>
            <p className="text-[11px] text-slate-400 mt-1">
              Treasury vault backing all user accounts
            </p>
          </div>
        </div>

        {/* KPI 2: Gross Deposits */}
        <Link
          href="/tetherly-master-control/deposits"
          className="rounded-2xl p-5 bg-white border border-slate-200/80 shadow-sm hover:shadow-md transition-all active:scale-[0.99] cursor-pointer flex flex-col justify-between block group"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Total Inflow
            </span>
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="1" x2="12" y2="23" />
                <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
              </svg>
            </div>
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <h2 className="text-2xl font-black text-slate-900 tracking-tight tabular-nums group-hover:text-blue-600 transition-colors">
                ${totalDeposits.toLocaleString('en-US')}
              </h2>
              <span className="text-xs font-bold text-blue-600">USDT</span>
            </div>
            <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-500 font-medium">
              {pendingDeposits.length > 0 ? (
                <span className="text-amber-600 font-bold animate-pulse">{pendingDeposits.length} Pending Approval</span>
              ) : (
                <span className="text-emerald-600 font-bold">TRC-20 & BEP-20</span>
              )}
              <span>•</span>
              <span>Deposit Queue →</span>
            </div>
          </div>
        </Link>

        {/* KPI 3: Pending Payouts */}
        <Link
          href="/tetherly-master-control/withdrawals"
          className="rounded-2xl p-5 bg-white border border-slate-200/80 shadow-sm hover:shadow-md transition-all active:scale-[0.99] cursor-pointer flex flex-col justify-between block group"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Pending Payouts
            </span>
            <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <h2 className="text-2xl font-black text-slate-900 tracking-tight tabular-nums group-hover:text-amber-600 transition-colors">
                {pendingWithdrawals.length}
              </h2>
              <span className="text-xs font-bold text-amber-600">
                (${pendingAmount.toLocaleString('en-US')} USDT)
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              {pendingWithdrawals.length > 0 ? 'Awaiting verification' : 'Payout queues clear'}
            </p>
          </div>
        </Link>

        {/* KPI 4: Registered Users */}
        <Link
          href="/tetherly-master-control/users"
          className="rounded-2xl p-5 bg-white border border-slate-200/80 shadow-sm hover:shadow-md transition-all active:scale-[0.99] cursor-pointer flex flex-col justify-between block group"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Total Accounts
            </span>
            <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
                <circle cx="9" cy="7" r="4" />
              </svg>
            </div>
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <h2 className="text-2xl font-black text-slate-900 tracking-tight tabular-nums group-hover:text-purple-600 transition-colors">
                {safeUsers.length}
              </h2>
              <span className="text-xs font-bold text-slate-500">
                (${totalUserBalance.toLocaleString('en-US')} USDT liability)
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              <span className="text-emerald-600 font-bold">{activeUsers} Active</span> •{' '}
              <span className="text-slate-400">{blockedUsers} Blocked</span>
            </p>
          </div>
        </Link>
      </div>

      {/* Row 2: Desktop 2-Column Main Workspace (66% Left Ledger + 33% Right Accounts/Controls) */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
        {/* Left Section: Live Operational Ledger Data Table */}
        <div className="xl:col-span-2 space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
            {/* Table Header with Filters */}
            <div className="p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">Live Financial Ledger</h3>
                <p className="text-xs font-medium text-slate-500 mt-0.5">Real-time on-chain deposits, payouts, rewards, and system adjustments</p>
              </div>

              {/* Filter Tabs */}
              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
                {(['all', 'deposit', 'withdrawal', 'bonus'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setTableFilter(tab)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition-all cursor-pointer ${
                      tableFilter === tab
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    {tab === 'all' ? 'All Records' : `${tab}s`}
                  </button>
                ))}
              </div>
            </div>

            {/* Desktop Data Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="py-3.5 px-5">Type / Network</th>
                    <th className="py-3.5 px-4">TXID / Address</th>
                    <th className="py-3.5 px-4">Timestamp</th>
                    <th className="py-3.5 px-4 text-right">Amount</th>
                    <th className="py-3.5 px-4 text-center">Status</th>
                    <th className="py-3.5 px-5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {filteredLedger.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-400">
                        No transactions recorded matching this filter.
                      </td>
                    </tr>
                  ) : (
                    filteredLedger.slice(0, 7).map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50/60 transition-colors">
                        {/* Type & Network */}
                        <td className="py-3.5 px-5 font-semibold text-slate-800">
                          <div className="flex items-center gap-2.5">
                            <span
                              className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-xs font-bold ${
                                item.amount > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                              }`}
                            >
                              {item.amount > 0 ? '↓' : '↑'}
                            </span>
                            <div>
                              <p className="capitalize font-bold text-slate-900">{item.type}</p>
                              <span className="text-[10px] text-slate-400 font-mono">{item.network}</span>
                            </div>
                          </div>
                        </td>

                        {/* TXID / Destination */}
                        <td className="py-3.5 px-4 font-mono text-[11px] text-slate-600">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate max-w-[140px] sm:max-w-[200px]" title={item.detail}>
                              {item.detail}
                            </span>
                            <button
                              onClick={() => handleCopy(item.detail)}
                              className="p-1 rounded text-slate-400 hover:text-slate-700 transition-colors"
                              title="Copy to clipboard"
                            >
                              {copiedId === item.detail ? (
                                <span className="text-emerald-600 font-bold text-[10px]">✓</span>
                              ) : (
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                  <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                                </svg>
                              )}
                            </button>
                          </div>
                        </td>

                        {/* Date */}
                        <td className="py-3.5 px-4 text-slate-500 text-[11px]">
                          {new Date(item.date).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>

                        {/* Amount */}
                        <td className="py-3.5 px-4 text-right font-bold tabular-nums">
                          <span className={item.amount > 0 ? 'text-emerald-600' : 'text-amber-600'}>
                            {item.amount > 0 ? '+' : ''}{item.amount.toLocaleString('en-US')} USDT
                          </span>
                        </td>

                        {/* Status */}
                        <td className="py-3.5 px-4 text-center">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold capitalize ${
                              item.status === 'completed'
                                ? 'bg-emerald-100 text-emerald-700'
                                : item.status === 'pending'
                                ? 'bg-amber-100 text-amber-800 animate-pulse'
                                : 'bg-red-100 text-red-700'
                            }`}
                          >
                            {item.status}
                          </span>
                        </td>

                        {/* Action */}
                        <td className="py-3.5 px-5 text-right">
                          {item.isWithdrawal && item.status === 'pending' ? (
                            <button
                              onClick={() => handleQuickApprove(item.id)}
                              disabled={quickApprovedId === item.id}
                              className="px-3 py-1 rounded-lg text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition-all active:scale-95 disabled:opacity-50 cursor-pointer shadow-sm"
                            >
                              {quickApprovedId === item.id ? 'Approved' : 'Approve'}
                            </button>
                          ) : item.type === 'deposit' && item.status === 'pending' ? (
                            <button
                              onClick={() => approveDeposit(item.id)}
                              className="px-3 py-1 rounded-lg text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition-all active:scale-95 cursor-pointer shadow-sm"
                            >
                              Approve
                            </button>
                          ) : (
                            <span className="text-[11px] text-slate-400 font-medium">Settled</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Footer View All */}
            <div className="p-4 bg-slate-50/50 border-t border-slate-200 flex items-center justify-between text-xs">
              <span className="text-slate-500">Showing latest records across all networks</span>
              <Link
                href="/tetherly-master-control/transactions"
                className="font-bold text-emerald-600 hover:text-emerald-700 hover:underline flex items-center gap-1"
              >
                <span>View Full On-Chain Ledger</span>
                <span>→</span>
              </Link>
            </div>
          </div>

          {/* Treasury Solvency & Gateway Details Card */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm">
            <h3 className="text-sm font-bold text-slate-900 mb-3">Treasury Solvency & Node Telemetry</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Hot Vault (TRC-20)</p>
                <p className="text-base font-black text-slate-900 mt-1 tabular-nums">
                  ${(platformReserves * 0.7).toLocaleString('en-US', { maximumFractionDigits: 0 })} USDT
                </p>
                <span className="text-[10px] text-emerald-600 font-semibold">Immediate Liquidity (70%)</span>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Cold Storage Vault</p>
                <p className="text-base font-black text-slate-900 mt-1 tabular-nums">
                  ${(platformReserves * 0.3).toLocaleString('en-US', { maximumFractionDigits: 0 })} USDT
                </p>
                <span className="text-[10px] text-blue-600 font-semibold">Multi-Sig Cold Storage (30%)</span>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Solvency Ratio</p>
                <p className="text-base font-black text-emerald-600 mt-1 tabular-nums">
                  118.2%
                </p>
                <span className="text-[10px] text-slate-500 font-medium">Over-collateralized</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Section: Users Quick Manager & Controls */}
        <div className="space-y-6">
          {/* User Accounts Management Box */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">User Accounts</h3>
                <p className="text-[11px] text-slate-500">{safeUsers.length} accounts registered</p>
              </div>
              <Link
                href="/tetherly-master-control/users"
                className="text-xs font-bold text-emerald-600 hover:text-emerald-700"
              >
                Manage All →
              </Link>
            </div>

            {/* Quick Search */}
            <div className="p-3 border-b border-slate-100 bg-slate-50/50">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search UID, name, email..."
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 text-xs rounded-xl bg-white border border-slate-200 outline-none focus:border-emerald-500 shadow-sm"
                />
                <svg className="absolute left-2.5 top-2.5 text-slate-400" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </div>
            </div>

            {/* User List */}
            <div className="divide-y divide-slate-100 max-h-[420px] overflow-y-auto">
              {filteredUsers.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400">No users found</div>
              ) : (
                filteredUsers.map((u) => (
                  <div key={u.id} className="p-4 hover:bg-slate-50/80 transition-colors">
                    <div className="flex items-start justify-between mb-1.5">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <h4 className="text-xs font-bold text-slate-900">{u.name}</h4>
                          <span
                            className={`text-[9px] font-extrabold px-1.5 py-0.2 rounded capitalize ${
                              u.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                            }`}
                          >
                            {u.status}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400">{u.email}</p>
                      </div>

                      <div className="text-right">
                        <p className="text-xs font-black text-emerald-600 tabular-nums">
                          ${u.balance.toLocaleString('en-US')} USDT
                        </p>
                      </div>
                    </div>

                    {/* UID row + Action buttons */}
                    <div className="flex items-center justify-between pt-2 mt-2 border-t border-slate-100">
                      <button
                        onClick={() => handleCopy(u.id)}
                        className="text-[10px] font-mono text-slate-500 hover:text-slate-800 flex items-center gap-1 cursor-pointer"
                        title="Copy UID"
                      >
                        <span>UID: {u.id}</span>
                        {copiedId === u.id ? (
                          <span className="text-emerald-600 font-bold">✓</span>
                        ) : (
                          <span className="text-slate-400 hover:text-slate-600">❐</span>
                        )}
                      </button>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => openActionForUser(u.id, 'credit')}
                          className="px-2 py-1 rounded-lg text-[10px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-all cursor-pointer border border-emerald-200/60"
                          title="Credit USDT"
                        >
                          + Credit
                        </button>
                        <button
                          onClick={() => openActionForUser(u.id, 'debit')}
                          className="px-2 py-1 rounded-lg text-[10px] font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 transition-all cursor-pointer border border-rose-200/60"
                          title="Debit USDT"
                        >
                          - Debit
                        </button>
                        <button
                          onClick={() => toggleUserStatus(u.id)}
                          className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                            u.status === 'active'
                              ? 'text-red-700 bg-red-50 hover:bg-red-100'
                              : 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100'
                          }`}
                        >
                          {u.status === 'active' ? 'Freeze' : 'Unfreeze'}
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Quick Platform Actions Box */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm space-y-3">
            <h3 className="text-sm font-bold text-slate-900">Administrative Shortcuts</h3>
            <div className="space-y-2">
              <Link
                href="/tetherly-master-control/withdrawals"
                className="flex items-center justify-between p-3 rounded-xl bg-slate-50 hover:bg-amber-50/70 border border-slate-100 transition-all cursor-pointer group block"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-amber-500 text-white flex items-center justify-center font-bold text-xs">
                    💸
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-900 group-hover:text-amber-900">
                      Withdrawals Engine
                    </p>
                    <p className="text-[10px] text-slate-500">{pendingWithdrawals.length} waiting in queue</p>
                  </div>
                </div>
                <span className="text-slate-400 text-xs group-hover:translate-x-0.5 transition-transform">→</span>
              </Link>

              <Link
                href="/tetherly-master-control/users"
                className="flex items-center justify-between p-3 rounded-xl bg-slate-50 hover:bg-blue-50/70 border border-slate-100 transition-all cursor-pointer group block"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-xs">
                    👥
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-900 group-hover:text-blue-900">
                      User Accounts Management
                    </p>
                    <p className="text-[10px] text-slate-500">Credit / Debit balances & inspect UIDs</p>
                  </div>
                </div>
                <span className="text-slate-400 text-xs group-hover:translate-x-0.5 transition-transform">→</span>
              </Link>

              <Link
                href="/tetherly-master-control/transactions"
                className="flex items-center justify-between p-3 rounded-xl bg-slate-50 hover:bg-emerald-50/70 border border-slate-100 transition-all cursor-pointer group block"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold text-xs">
                    📑
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-900 group-hover:text-emerald-900">
                      On-Chain Audit Records
                    </p>
                    <p className="text-[10px] text-slate-500">{safeTransactions.length} transaction entries</p>
                  </div>
                </div>
                <span className="text-slate-400 text-xs group-hover:translate-x-0.5 transition-transform">→</span>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Credit Modal */}
      {showQuickCreditModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{ background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(6px)' }}
        >
          <div className="w-full max-w-md rounded-3xl p-6 bg-white shadow-2xl border border-slate-100">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2.5">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm ${
                  creditType === 'credit' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                }`}>
                  {creditType === 'credit' ? '＋' : '－'}
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {creditType === 'credit' ? 'Credit User Balance' : 'Debit User Balance'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {creditType === 'credit' ? 'Add funds to user USDT balance' : 'Deduct funds from user USDT balance'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowQuickCreditModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center text-xs font-bold cursor-pointer transition-colors"
              >
                ✕
              </button>
            </div>

            {creditSuccessMsg && (
              <div
                className={`p-3 mb-4 rounded-xl text-xs font-semibold text-center border ${
                  creditSuccessMsg.startsWith('Error')
                    ? 'bg-red-50 border-red-200 text-red-800'
                    : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                }`}
              >
                {creditSuccessMsg}
              </div>
            )}

            {/* Find & Select User Section */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-slate-700">Find & Select User Account</label>
                {selectedUser && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedUserId('')
                      setModalUserSearch('')
                    }}
                    className="text-[11px] font-bold text-slate-400 hover:text-red-500 cursor-pointer flex items-center gap-1 transition-colors"
                  >
                    <span>Change User</span>
                    <span>✕</span>
                  </button>
                )}
              </div>

              {/* Selected User Display Card */}
              {selectedUser ? (
                <div className="p-3 rounded-2xl bg-emerald-50/70 border border-emerald-200/80 flex items-center justify-between">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center font-bold text-white text-xs shrink-0 shadow-xs">
                      {selectedUser.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-xs font-bold text-slate-900 truncate">{selectedUser.name}</p>
                        <span className="font-mono text-[10px] text-slate-500 bg-white px-1.5 py-0.5 rounded border border-slate-200 font-bold shrink-0">
                          UID: {selectedUser.id}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 truncate">{selectedUser.email}</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0 pl-2">
                    <span className="text-[9px] text-slate-400 block font-bold uppercase tracking-wider">Current Balance</span>
                    <span className="text-xs font-black text-emerald-600 tabular-nums">
                      ${selectedUser.balance.toLocaleString('en-US')} USDT
                    </span>
                  </div>
                </div>
              ) : (
                /* Search / Find Input + Results */
                <div className="space-y-2">
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Type UID, name, or email to find user..."
                      value={modalUserSearch}
                      onChange={(e) => setModalUserSearch(e.target.value)}
                      className="w-full pl-9 pr-8 py-2.5 text-xs font-medium rounded-xl bg-slate-50 border border-slate-200 outline-none focus:border-emerald-500 shadow-sm"
                      autoFocus
                    />
                    <svg className="absolute left-3 top-3 text-slate-400" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="11" cy="11" r="8" />
                      <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                    {modalUserSearch && (
                      <button
                        type="button"
                        onClick={() => setModalUserSearch('')}
                        className="absolute right-2.5 top-2.5 w-5 h-5 rounded-full bg-slate-200 hover:bg-slate-300 text-slate-600 flex items-center justify-center text-[10px] font-bold cursor-pointer"
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  <div className="max-h-44 overflow-y-auto space-y-1.5 border border-slate-200/80 rounded-xl p-1.5 bg-slate-50/50">
                    {filteredModalUsers.length === 0 ? (
                      <div className="py-4 text-center text-xs text-slate-400">
                        No user found matching "{modalUserSearch}".
                      </div>
                    ) : (
                      filteredModalUsers.map((u) => (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => {
                            setSelectedUserId(u.id)
                            setModalUserSearch('')
                          }}
                          className="w-full p-2 rounded-xl flex items-center justify-between text-left bg-white hover:bg-emerald-50/60 border border-slate-100 hover:border-emerald-200 transition-all cursor-pointer"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-7 h-7 rounded-lg bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-[10px] shrink-0">
                              {u.name.slice(0, 2).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-slate-900 truncate">{u.name}</p>
                              <p className="text-[10px] text-slate-400 truncate">
                                UID: <span className="font-mono font-semibold text-slate-600">{u.id}</span> · {u.email}
                              </p>
                            </div>
                          </div>
                          <span className="text-xs font-extrabold text-emerald-600 tabular-nums shrink-0 pl-2">
                            ${u.balance.toLocaleString('en-US')}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Mode Toggle */}
            <div className="flex rounded-xl p-1 mb-4 bg-slate-100">
              <button
                type="button"
                onClick={() => setCreditType('credit')}
                className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  creditType === 'credit' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                + Credit Funds (Add)
              </button>
              <button
                type="button"
                onClick={() => setCreditType('debit')}
                className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  creditType === 'debit' ? 'bg-white text-rose-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                - Debit Funds (Deduct)
              </button>
            </div>

            {/* Live Calculation Preview Card */}
            {selectedUser && (
              <div className="p-3 mb-4 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-between text-xs">
                <div>
                  <span className="text-slate-400 block text-[9px] uppercase font-bold tracking-wider">Current</span>
                  <span className="font-bold text-slate-900 text-xs">${selectedUser.balance.toLocaleString('en-US')}</span>
                </div>
                <div className="text-center">
                  <span className="text-slate-400 block text-[9px] uppercase font-bold tracking-wider">
                    {creditType === 'credit' ? '+ Credit' : '- Debit'}
                  </span>
                  <span
                    className={`font-black text-xs ${
                      creditType === 'credit' ? 'text-emerald-600' : 'text-rose-600'
                    }`}
                  >
                    {creditType === 'credit' ? '+' : '-'}${currentCreditAmt.toLocaleString('en-US')}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-slate-400 block text-[9px] uppercase font-bold tracking-wider">New Balance</span>
                  <span className="font-black text-emerald-600 text-xs">${previewNewBalance.toLocaleString('en-US')} USDT</span>
                </div>
              </div>
            )}

            {/* Quick Amount Presets */}
            <div className="mb-3">
              <label className="text-[11px] font-bold text-slate-500 block mb-1.5">Quick Presets</label>
              <div className="flex flex-wrap gap-1.5">
                {[50, 100, 500, 1000, 5000].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setCreditAmount(String(preset))}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-all cursor-pointer"
                  >
                    {creditType === 'credit' ? `+$${preset}` : `-$${preset}`}
                  </button>
                ))}
                {creditType === 'debit' && selectedUser && (
                  <button
                    type="button"
                    onClick={() => setCreditAmount(String(selectedUser.balance))}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-rose-100 hover:bg-rose-200 text-rose-700 transition-all cursor-pointer"
                  >
                    All (${selectedUser.balance.toLocaleString('en-US')})
                  </button>
                )}
              </div>
            </div>

            {/* Amount */}
            <div className="mb-5">
              <label className="text-xs font-bold text-slate-700 block mb-1.5">
                USDT Amount to {creditType === 'credit' ? 'Credit' : 'Debit'}
              </label>
              <div className="relative">
                <input
                  type="number"
                  placeholder="e.g. 500"
                  value={creditAmount}
                  onChange={(e) => setCreditAmount(e.target.value)}
                  className="w-full pl-4 pr-16 py-3 text-sm font-bold rounded-xl border border-slate-200 outline-none focus:border-emerald-500"
                  min="0"
                />
                <span className="absolute right-3.5 top-3.5 text-xs font-bold text-slate-400">
                  USDT
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setShowQuickCreditModal(false)
                  setModalUserSearch('')
                }}
                className="flex-1 py-2.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-600 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleQuickCredit}
                disabled={!selectedUserId || !creditAmount || parseFloat(creditAmount) <= 0}
                className={`flex-1 py-2.5 rounded-xl text-xs font-bold text-white transition-all active:scale-95 disabled:opacity-50 cursor-pointer shadow-md ${
                  creditType === 'credit'
                    ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20'
                    : 'bg-rose-600 hover:bg-rose-700 shadow-rose-600/20'
                }`}
              >
                {creditType === 'credit' ? 'Confirm Credit (+)' : 'Confirm Debit (-)'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


