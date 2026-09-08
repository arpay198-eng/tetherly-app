'use client'

import { useState } from 'react'
import { apiGet, apiPost } from '@/lib/firebaseService'

type NotifType = 'info' | 'success' | 'warning'

const TYPE_COLORS: Record<NotifType, string> = {
  info: '#06b6d4',
  success: '#10b981',
  warning: '#f59e0b',
}

interface NotifItem {
  id: string
  userId: string
  title: string
  message: string
  type: NotifType
  read: boolean
  date: string
}

export default function AdminNotificationsPage() {
  const [userId, setUserId] = useState('')
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [type, setType] = useState<NotifType>('info')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)
  const [history, setHistory] = useState<NotifItem[] | null>(null)
  const [historyUid, setHistoryUid] = useState('')

  const sendNotification = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!userId.trim() || !title.trim() || sending) return
    setSending(true)
    setResult(null)
    try {
      await apiPost('/notifications', { userId: userId.trim(), title: title.trim(), message: message.trim(), type })
      setResult({ ok: true, text: 'Notification delivered successfully.' })
      setTitle('')
      setMessage('')
      await loadHistory(userId.trim())
    } catch (err: any) {
      setResult({ ok: false, text: err?.message || 'Failed to send notification' })
    } finally {
      setSending(false)
    }
  }

  const loadHistory = async (uid: string) => {
    const target = uid || userId.trim()
    if (!target) return
    try {
      const list = await apiGet(`/notifications?userId=${encodeURIComponent(target)}`)
      setHistory(list || [])
      setHistoryUid(target)
    } catch {
      setHistory([])
      setHistoryUid(target)
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
        <h1 className="text-xl font-bold text-slate-900 tracking-tight">Notifications Broadcasting</h1>
        <p className="text-xs text-slate-500 mt-1">
          Push a real-time notification (bell badge) to any user by their User ID. Delivery is server-verified.
        </p>
      </div>

      <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
        <form onSubmit={sendNotification} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">User ID *</label>
              <input
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                placeholder="e.g. 2817782317"
                className="w-full px-4 py-2.5 rounded-xl text-sm border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none text-slate-900"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Type</label>
              <div className="flex gap-1.5">
                {(['info', 'success', 'warning'] as NotifType[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    className={`px-3 py-2.5 rounded-lg text-xs font-bold capitalize transition-all cursor-pointer ${
                      type === t ? 'text-white' : 'bg-slate-100 text-slate-500 hover:text-slate-800'
                    }`}
                    style={type === t ? { background: TYPE_COLORS[t] } : undefined}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Title *</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Notification title"
              className="w-full px-4 py-2.5 rounded-xl text-sm border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none text-slate-900"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Message</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Notification message"
              rows={3}
              className="w-full px-4 py-2.5 rounded-xl text-sm border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none text-slate-900 resize-none"
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={sending || !userId.trim() || !title.trim()}
              className="px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-gradient-to-tr from-emerald-500 to-teal-500 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {sending ? 'Sending...' : 'Send Notification'}
            </button>
            <button
              type="button"
              onClick={() => loadHistory(userId.trim())}
              className="px-5 py-2.5 rounded-xl text-sm font-bold text-slate-600 border border-slate-200 hover:bg-slate-50"
            >
              Check User&apos;s Notifications
            </button>
          </div>

          {result && (
            <p className="text-sm font-medium" style={{ color: result.ok ? '#059669' : '#dc2626' }}>
              {result.text}
            </p>
          )}
        </form>
      </div>

      {history && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200/80 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900">Recent notifications for UID {historyUid}</h2>
            <span className="text-[11px] font-bold text-slate-400">{history.length} total</span>
          </div>
          {history.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-slate-400">No notifications found for this user.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {history.map((n) => (
                <div key={n.id} className="px-5 py-3.5 flex items-start gap-3">
                  <span
                    className="w-2 h-2 rounded-full mt-1.5 flex-none"
                    style={{ background: TYPE_COLORS[n.type] || '#06b6d4' }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-slate-800 truncate">{n.title}</p>
                      {n.read && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-400">READ</span>}
                    </div>
                    {n.message && <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{n.message}</p>}
                    <p className="text-[10px] text-slate-400 mt-1">{new Date(n.date).toLocaleString()}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}