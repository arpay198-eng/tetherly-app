'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useStore, AdminUserItem, WithdrawalRequest, DepositRequest, Transaction } from '@/store/useStore'
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore'
import { db } from '@/lib/firebase'

export default function MasterControlLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  const [isUnlocked, setIsUnlocked] = useState(false)
  const [adminId, setAdminId] = useState('')
  const [adminPassword, setAdminPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isVerifying, setIsVerifying] = useState(false)
  const [loginError, setLoginError] = useState('')
  const [adminProfile, setAdminProfile] = useState({ name: 'Rahim Badsha', email: 'rohim.badsha198@gmail.com' })
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [failedAttempts, setFailedAttempts] = useState(0)
  const [lockoutUntil, setLockoutUntil] = useState<number | null>(null)
  const [cooldownSeconds, setCooldownSeconds] = useState(0)

  const [allUsers, setAllUsers] = useState<AdminUserItem[]>([])
  const [withdrawalRequests, setWithdrawalRequests] = useState<WithdrawalRequest[]>([])
  const [depositRequests, setDepositRequests] = useState<DepositRequest[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [openTickets, setOpenTickets] = useState(0)

  useEffect(() => {
    const store = useStore.getState()
    setAllUsers(store.allUsers || [])
    setWithdrawalRequests(store.withdrawalRequests || [])
    setDepositRequests(store.depositRequests || [])
    setTransactions(store.transactions || [])
  }, [])

  useEffect(() => {
    if (!isUnlocked) return
    let alive = true
    const loadOpenTickets = async () => {
      try {
        const token = typeof window !== 'undefined' ? window.localStorage.getItem('tetherly_auth') : null
        const res = await fetch('/api/support', {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          cache: 'no-store',
        })
        if (!res.ok) return
        const list: any[] = await res.json()
        if (alive) setOpenTickets((list || []).filter((t) => t && t.status === 'open').length)
      } catch {
        if (alive) setOpenTickets(0)
      }
    }
    loadOpenTickets()
    return () => { alive = false }
  }, [isUnlocked, pathname])

  useEffect(() => {
    setMounted(true)
    if (typeof window !== 'undefined') {
      const unlocked = sessionStorage.getItem('tetherly_master_unlocked')
      const storedProfile = sessionStorage.getItem('tetherly_admin_profile')
      if (unlocked === 'true') {
        // Re-verify the stored JWT server-side before trusting sessionStorage.
        const token = localStorage.getItem('tetherly_auth_token')
        if (!token) {
          sessionStorage.removeItem('tetherly_master_unlocked')
          sessionStorage.removeItem('tetherly_admin_profile')
        } else {
          fetch('/api/users', { headers: { Authorization: `Bearer ${token}` } })
            .then((r) => {
              if (r.ok) {
                setIsUnlocked(true)
                if (storedProfile) {
                  try { setAdminProfile(JSON.parse(storedProfile)) } catch {}
                }
              } else {
                sessionStorage.removeItem('tetherly_master_unlocked')
                sessionStorage.removeItem('tetherly_admin_profile')
                localStorage.removeItem('tetherly_auth_token')
              }
            })
            .catch(() => {
              // Network error — keep existing state, will retry on next action.
            })
        }
      }

      // Check existing failed attempts and active lockout
      const storedAttempts = localStorage.getItem('tetherly_admin_failed_attempts')
      if (storedAttempts) {
        setFailedAttempts(parseInt(storedAttempts, 10) || 0)
      }

      const storedLockout = localStorage.getItem('tetherly_admin_lockout_until')
      if (storedLockout) {
        const lockoutTime = parseInt(storedLockout, 10)
        const now = Date.now()
        if (lockoutTime > now) {
          setLockoutUntil(lockoutTime)
          setCooldownSeconds(Math.ceil((lockoutTime - now) / 1000))
        } else {
          localStorage.removeItem('tetherly_admin_lockout_until')
          localStorage.removeItem('tetherly_admin_failed_attempts')
          setFailedAttempts(0)
        }
      }
    }
  }, [])

  // Live timer interval for cooldown
  useEffect(() => {
    if (cooldownSeconds <= 0) return

    const timer = setInterval(() => {
      setCooldownSeconds((prev: number) => {
        if (prev <= 1) {
          clearInterval(timer)
          setLockoutUntil(null)
          setFailedAttempts(0)
          setLoginError('')
          if (typeof window !== 'undefined') {
            localStorage.removeItem('tetherly_admin_lockout_until')
            localStorage.removeItem('tetherly_admin_failed_attempts')
          }
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [cooldownSeconds])

  const registerFailedAttempt = (errorMessage: string) => {
    const nextAttempts = failedAttempts + 1
    setFailedAttempts(nextAttempts)
    if (typeof window !== 'undefined') {
      localStorage.setItem('tetherly_admin_failed_attempts', nextAttempts.toString())
    }

    if (nextAttempts >= 2) {
      const lockTime = Date.now() + 60 * 1000 // 1 minute lockout
      setLockoutUntil(lockTime)
      setCooldownSeconds(60)
      if (typeof window !== 'undefined') {
        localStorage.setItem('tetherly_admin_lockout_until', lockTime.toString())
      }
      setLoginError('2 failed attempts detected. Login blocked for 1 minute for security.')
    } else {
      setLoginError(`${errorMessage} Warning: 1 attempt remaining before 1-minute security block.`)
    }
  }

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoginError('')

    if (cooldownSeconds > 0) {
      setLoginError(`Security cooldown active. Please wait ${cooldownSeconds}s before trying again.`)
      return
    }

    const cleanId = adminId.trim().toLowerCase()
    const cleanPass = adminPassword.trim()

    if (!cleanId || !cleanPass) {
      setLoginError('Admin ID/Email and Password are required.')
      return
    }

    setIsVerifying(true)

    try {
      let foundUser: AdminUserItem | null = null

      // 1. Direct real-time lookup in Firebase Firestore by document ID
      try {
        const docRef = doc(db, 'users', cleanId)
        const docSnap = await getDoc(docRef)
        if (docSnap.exists()) {
          foundUser = docSnap.data() as AdminUserItem
        }
      } catch (err) {
        console.warn('Doc lookup error:', err)
      }

      // 2. If not found by ID, query Firebase Firestore by email
      if (!foundUser) {
        try {
          const q = query(collection(db, 'users'), where('email', '==', cleanId))
          const querySnap = await getDocs(q)
          if (!querySnap.empty) {
            foundUser = querySnap.docs[0].data() as AdminUserItem
          }
        } catch (err) {
          console.warn('Query lookup error:', err)
        }
      }

      // 3. Fallback to store if offline
      if (!foundUser && allUsers && allUsers.length > 0) {
        foundUser =
          allUsers.find(
            (u) => u.email.toLowerCase() === cleanId || u.id.toLowerCase() === cleanId
          ) || null
      }

      // 4. Verify account existence in Firebase
      if (!foundUser) {
        registerFailedAttempt('Access Denied: Account not found in Firebase.')
        setIsVerifying(false)
        return
      }

      // 5. Verify Admin Role / Authorization in Firebase
      const isAuthorizedAdmin =
        foundUser.role === 'admin' ||
        foundUser.isAdmin === true

      if (!isAuthorizedAdmin) {
        registerFailedAttempt('Access Denied: Not an authorized Admin.')
        setIsVerifying(false)
        return
      }

      // 6. Verify Account Status
      if (foundUser.status === 'blocked') {
        setLoginError('This Admin account has been blocked.')
        setIsVerifying(false)
        return
      }

      // 7. Verify Password from Firebase
      if (foundUser.password !== cleanPass) {
        registerFailedAttempt('Incorrect Password. Authentication failed.')
        setIsVerifying(false)
        return
      }

      // Authentication Successful! Reset failure counters
      setFailedAttempts(0)
      setLockoutUntil(null)
      setCooldownSeconds(0)
      if (typeof window !== 'undefined') {
        localStorage.removeItem('tetherly_admin_failed_attempts')
        localStorage.removeItem('tetherly_admin_lockout_until')
      }

      const profile = {
        name: foundUser.name || 'Rahim Badsha',
        email: foundUser.email || 'rohim.badsha198@gmail.com',
      }
      setAdminProfile(profile)
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('tetherly_master_unlocked', 'true')
        sessionStorage.setItem('tetherly_admin_profile', JSON.stringify(profile))
      }
      setIsUnlocked(true)
      setAdminPassword('')
      setLoginError('')
    } catch (error: any) {
      console.error('Firebase Auth error:', error)
      setLoginError('Firebase verification error: ' + (error?.message || 'Connection failed'))
    } finally {
      setIsVerifying(false)
    }
  }

  const handleLock = () => {
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('tetherly_master_unlocked')
      sessionStorage.removeItem('tetherly_admin_profile')
    }
    setIsUnlocked(false)
    setAdminPassword('')
    setLoginError('')
  }

  const pendingWithdrawals = (withdrawalRequests || []).filter((r) => r.status === 'pending')
  const pendingDeposits = (depositRequests || []).filter((r) => r.status === 'pending')

  const navItems = [
    {
      name: 'Dashboard Overview',
      href: '/tetherly-master-control',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="14" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
        </svg>
      ),
      badge: null,
    },
    {
      name: 'Deposits Queue',
      href: '/tetherly-master-control/deposits',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22V8M5 15l7-7 7 7" />
          <path d="M2 7V5a2 2 0 012-2h16a2 2 0 012 2v2" />
        </svg>
      ),
      badge: pendingDeposits.length > 0 ? `${pendingDeposits.length} Pending` : null,
      badgeColor: 'amber',
    },
    {
      name: 'Withdrawals Queue',
      href: '/tetherly-master-control/withdrawals',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2v14M19 9l-7 7-7-7" />
          <path d="M2 17v2a2 2 0 002 2h16a2 2 0 002-2v-2" />
        </svg>
      ),
      badge: pendingWithdrawals.length > 0 ? `${pendingWithdrawals.length} Pending` : null,
      badgeColor: 'amber',
    },
    {
      name: 'Notifications',
      href: '/tetherly-master-control/notifications',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 01-3.46 0" />
        </svg>
      ),
      badge: null,
    },
    {
      name: 'Support Tickets',
      href: '/tetherly-master-control/support',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
          <path d="M8 9h8M8 13h5" />
        </svg>
      ),
      badge: openTickets > 0 ? `${openTickets} Open` : null,
      badgeColor: 'amber',
    },
    {
      name: 'Users Management',
      href: '/tetherly-master-control/users',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 00-3-3.87" />
          <path d="M16 3.13a4 4 0 010 7.75" />
        </svg>
      ),
      badge: `${(allUsers || []).length}`,
      badgeColor: 'blue',
    },
    {
      name: 'Financial Ledger',
      href: '/tetherly-master-control/transactions',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
        </svg>
      ),
      badge: `${(transactions || []).length}`,
      badgeColor: 'emerald',
    },
  ]

  const getBreadcrumb = () => {
    switch (pathname) {
      case '/tetherly-master-control':
        return 'System Overview'
      case '/tetherly-master-control/deposits':
        return 'Deposit Requests & On-Chain Verification'
      case '/tetherly-master-control/withdrawals':
        return 'Withdrawal Requests & Payout Queue'
      case '/tetherly-master-control/users':
        return 'Registered Accounts & Balances'
      case '/tetherly-master-control/transactions':
        return 'Financial Ledger & Audit Trail'
      case '/tetherly-master-control/notifications':
        return 'Notifications Broadcasting'
      case '/tetherly-master-control/support':
        return 'Support Tickets & Issue Resolution'
      default:
        return 'Master Console'
    }
  }

  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0b1329] text-white">
        <div className="flex flex-col items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-400 p-0.5 shadow-lg shadow-emerald-500/20 flex items-center justify-center animate-pulse">
            <div className="w-full h-full bg-[#0b1329] rounded-[14px] flex items-center justify-center">
              <span className="text-emerald-400 font-black text-xl">₮</span>
            </div>
          </div>
          <p className="text-xs font-semibold text-slate-400">Loading Master Control...</p>
        </div>
      </div>
    )
  }

  // Security Gate Logical Admin Login Screen
  if (!isUnlocked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#070d1e] px-4 font-sans text-slate-100 relative overflow-hidden">
        {/* Subtle background glow */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-10 right-10 w-72 h-72 bg-teal-500/5 rounded-full blur-2xl pointer-events-none" />

        <div className="w-full max-w-md p-8 sm:p-9 rounded-3xl bg-[#0e172e]/90 border border-slate-700/60 shadow-2xl backdrop-blur-2xl relative z-10">
          {/* Brand & Security Badge */}
          <div className="text-center mb-7">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-emerald-500 via-teal-400 to-emerald-600 p-0.5 mx-auto mb-4 shadow-xl shadow-emerald-500/20 flex items-center justify-center">
              <div className="w-full h-full bg-[#070d1e] rounded-[14px] flex items-center justify-center">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  <path d="M9 12l2 2 4-4" />
                </svg>
              </div>
            </div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[11px] font-bold tracking-wider uppercase mb-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Restricted Area
            </div>
            <h1 className="text-2xl font-black text-white tracking-tight">Master Admin Login</h1>
            <p className="text-xs text-slate-400 mt-1">Platform Owner & System Control Authentication</p>
          </div>

          {/* Cooldown Active Warning with Live Countdown */}
          {cooldownSeconds > 0 ? (
            <div className="mb-5 p-4 rounded-2xl bg-red-500/10 border border-red-500/30 text-slate-100">
              <div className="flex items-center gap-2 text-red-400 font-bold text-xs mb-1">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <span>Security Lockdown (Brute-Force Shield)</span>
              </div>
              <p className="text-[11px] text-slate-300 mb-2.5">
                2 failed login attempts detected. Login is locked for 1 minute.
              </p>
              <div className="flex items-center justify-between px-3.5 py-2 rounded-xl bg-slate-950/80 border border-red-500/30 font-mono">
                <span className="text-xs text-slate-400">Try again in:</span>
                <span className="text-red-400 font-black text-sm tracking-wider">
                  00:{cooldownSeconds < 10 ? '0' : ''}{cooldownSeconds}s
                </span>
              </div>
            </div>
          ) : loginError ? (
            <div className="mb-5 p-3.5 rounded-xl bg-red-500/15 border border-red-500/40 text-red-300 text-xs flex items-center gap-2.5 font-medium animate-shake">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-red-400">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>{loginError}</span>
            </div>
          ) : null}

          {/* Form */}
          <form onSubmit={handleAdminLogin} className="space-y-4">
            {/* Field 1: Admin ID / Email */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Admin Login ID / Email
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                </div>
                <input
                  type="text"
                  value={adminId}
                  onChange={(e) => setAdminId(e.target.value)}
                  disabled={isVerifying || cooldownSeconds > 0}
                  placeholder="Enter Admin ID / Email"
                  className="w-full pl-10 pr-4 py-3.5 rounded-xl bg-slate-900/90 border border-slate-700/80 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-sans"
                  autoFocus
                  autoComplete="username"
                />
              </div>
            </div>

            {/* Field 2: Admin Password */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Admin Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  disabled={isVerifying || cooldownSeconds > 0}
                  placeholder="Enter admin password..."
                  className="w-full pl-10 pr-12 py-3.5 rounded-xl bg-slate-900/90 border border-slate-700/80 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-sans"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  disabled={cooldownSeconds > 0}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-500 hover:text-slate-300 disabled:opacity-40 transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isVerifying || cooldownSeconds > 0}
              className="w-full mt-2 py-3.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 font-bold text-sm tracking-wide shadow-lg shadow-emerald-500/25 transition-all active:scale-[0.99] flex items-center justify-center gap-2"
            >
              {cooldownSeconds > 0 ? (
                <>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                  <span>Locked (00:{cooldownSeconds < 10 ? '0' : ''}{cooldownSeconds}s)</span>
                </>
              ) : isVerifying ? (
                <>
                  <svg className="animate-spin h-5 w-5 text-slate-950" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  <span>Verifying with Firebase...</span>
                </>
              ) : (
                <>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                    <polyline points="10 17 15 12 10 7" />
                    <line x1="15" y1="12" x2="3" y2="12" />
                  </svg>
                  <span>Sign In to Master Control</span>
                </>
              )}
            </button>
          </form>

          {/* Footer security notes */}
          <div className="mt-7 pt-5 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-500">
            <span className="flex items-center gap-1.5">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              256-Bit SSL Encrypted
            </span>
            <span>Tetherly v1.0 Owner Portal</span>
          </div>
        </div>
      </div>
    )
  }

  // Unlocked Master Admin Panel
  return (
    <div className="admin-portal-root min-h-screen flex bg-[#0f172a] text-slate-100 font-sans antialiased selection:bg-emerald-500 selection:text-white">
      {/* Desktop Sidebar (Fixed Left, w-72) */}
      <aside className="hidden lg:flex flex-col w-72 shrink-0 bg-[#0b1329] border-r border-slate-800/80 min-h-screen sticky top-0 h-screen overflow-y-auto">
        {/* Brand Header */}
        <div className="p-6 border-b border-slate-800/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-400 p-0.5 shadow-lg shadow-emerald-500/20 flex items-center justify-center">
              <div className="w-full h-full bg-[#0b1329] rounded-[14px] flex items-center justify-center">
                <span className="text-emerald-400 font-black text-lg">₮</span>
              </div>
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h1 className="text-base font-bold text-white tracking-tight">Tetherly</h1>
                <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  MASTER
                </span>
              </div>
              <p className="text-[11px] text-slate-400">Owner Administration</p>
            </div>
          </div>
        </div>

        {/* Node Connectivity Status */}
        <div className="px-6 py-3 bg-slate-900/60 border-b border-slate-800/50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <span className="text-[11px] font-medium text-slate-300">TRON Mainnet</span>
          </div>
          <span className="text-[10px] font-mono text-emerald-400">14ms latency</span>
        </div>

        {/* Navigation Links */}
        <div className="p-4 flex-1 space-y-6 overflow-y-auto">
          <div>
            <p className="px-3 text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-2">
              Core Operations
            </p>
            <nav className="space-y-1">
              {navItems.map((item) => {
                const isActive = pathname === item.href
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center justify-between px-3.5 py-3 rounded-xl text-xs font-semibold transition-all group ${
                      isActive
                        ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shadow-sm shadow-emerald-500/10'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className={isActive ? 'text-emerald-400' : 'text-slate-400 group-hover:text-slate-200'}>
                        {item.icon}
                      </span>
                      <span>{item.name}</span>
                    </div>
                    {item.badge && (
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                          item.badgeColor === 'amber'
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse'
                            : item.badgeColor === 'blue'
                            ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                            : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </Link>
                )
              })}
            </nav>
          </div>
        </div>

        {/* Sidebar Footer & Lock Console */}
        <div className="p-4 border-t border-slate-800/80 bg-slate-900/40 space-y-3">
          <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-800/50 border border-slate-700/40">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center font-bold text-white text-xs shrink-0">
                {adminProfile.name.split(' ').map((n) => n[0]).join('').substring(0, 2).toUpperCase() || 'AD'}
              </div>
              <div className="truncate">
                <p className="text-xs font-bold text-slate-200 leading-tight truncate">{adminProfile.name}</p>
                <p className="text-[10px] text-slate-400 truncate">{adminProfile.email}</p>
              </div>
            </div>
            <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 uppercase tracking-wide shrink-0">
              OWNER
            </span>
          </div>

          <button
            onClick={handleLock}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 text-xs font-semibold transition-all"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0110 0v4" />
            </svg>
            Lock Console
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#f8fafc] text-slate-900 min-h-screen">
        {/* Top Desktop Navigation Header Bar */}
        <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between gap-4 shadow-sm">
          {/* Left: Mobile hamburger & Breadcrumb */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileNavOpen(true)}
              className="lg:hidden p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-all"
              title="Open Navigation Menu"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>

            <div>
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
                <span>Tetherly Master Control</span>
                <span>/</span>
                <span className="text-slate-800 font-bold">{getBreadcrumb()}</span>
              </div>
            </div>
          </div>

          {/* Right Header Controls */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200/80">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs font-bold text-emerald-800">Master Verified</span>
            </div>

            <button
              onClick={handleLock}
              className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-red-50 hover:text-red-600 text-slate-600 text-xs font-semibold transition-all border border-slate-200"
              title="Lock Master Console"
            >
              Lock
            </button>
          </div>
        </header>

        {/* Page Content Slot */}
        <main className="flex-1 w-full max-w-[1600px] mx-auto p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>

      {/* Mobile Drawer Navigation (When on small screens) */}
      {mobileNavOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div
            onClick={() => setMobileNavOpen(false)}
            className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm transition-opacity"
          />

          <div className="relative w-72 max-w-[80vw] bg-[#0b1329] border-r border-slate-800 flex flex-col h-full z-10">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="w-8 h-8 rounded-xl bg-emerald-500 flex items-center justify-center font-black text-slate-950">
                  ₮
                </span>
                <span className="font-bold text-white text-base">Master Control</span>
              </div>
              <button
                onClick={() => setMobileNavOpen(false)}
                className="w-8 h-8 rounded-lg bg-slate-800 text-slate-400 flex items-center justify-center text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <div className="p-4 flex-1 space-y-2 overflow-y-auto">
              {navItems.map((item) => {
                const isActive = pathname === item.href
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileNavOpen(false)}
                    className={`flex items-center justify-between px-4 py-3 rounded-xl text-xs font-semibold ${
                      isActive
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span>{item.icon}</span>
                      <span>{item.name}</span>
                    </div>
                    {item.badge && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-400">
                        {item.badge}
                      </span>
                    )}
                  </Link>
                )
              })}
            </div>

            <div className="p-4 border-t border-slate-800">
              <button
                onClick={() => { setMobileNavOpen(false); handleLock(); }}
                className="w-full py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-bold"
              >
                Lock Console
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
