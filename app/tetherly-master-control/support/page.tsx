'use client'

import { useEffect, useState, useCallback } from 'react'
import { apiGet, apiPost } from '@/lib/firebaseService'

type TicketStatus = 'open' | 'resolved' | 'closed'

interface TicketReply {
  id: string
  from: 'user' | 'admin'
  message: string
  date: string
}

interface Ticket {
  id: string
  userId: string
  userName: string
  userEmail: string
  subject: string
  message: string
  status: TicketStatus
  createdAt: string
  updatedAt: string
  replies: TicketReply[]
}

const STATUS_STYLES: Record<TicketStatus, { color: string; bg: string; label: string }> = {
  open: { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', label: 'Open' },
  resolved: { color: '#10b981', bg: 'rgba(16,185,129,0.12)', label: 'Resolved' },
  closed: { color: '#64748b', bg: 'rgba(100,116,139,0.15)', label: 'Closed' },
}

export default function AdminSupportPage() {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState<'all' | TicketStatus>('all')
  const [selected, setSelected] = useState<Ticket | null>(null)
  const [reply, setReply] = useState('')
  const [replying, setReplying] = useState(false)
  const [statusAction, setStatusAction] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const list = await apiGet('/support')
      setTickets(list || [])
    } catch (err: any) {
      setError(err?.message || 'Failed to load tickets')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const openDetail = (t: Ticket) => {
    setSelected(t)
    setReply('')
  }

  const sendReply = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selected || !reply.trim() || replying) return
    setReplying(true)
    try {
      await apiPost('/support', { action: 'reply', id: selected.id, message: reply.trim() })
      setReply('')
      await load()
      const fresh = (await apiGet('/support')).find((t: Ticket) => t.id === selected.id)
      setSelected(fresh || null)
    } catch (err: any) {
      setError(err?.message || 'Failed to send reply')
    } finally {
      setReplying(false)
    }
  }

  const changeStatus = async (status: TicketStatus) => {
    if (!selected || statusAction) return
    setStatusAction(status)
    try {
      await apiPost('/support', { action: 'status', id: selected.id, status })
      await load()
      const fresh = (await apiGet('/support')).find((t: Ticket) => t.id === selected.id)
      setSelected(fresh || null)
    } catch (err: any) {
      setError(err?.message || 'Failed to update status')
    } finally {
      setStatusAction('')
    }
  }

  const filtered = activeTab === 'all' ? tickets : tickets.filter((t) => t.status === activeTab)

  const backToList = () => {
    setSelected(null)
    setError('')
  }

  if (selected) {
    const st = STATUS_STYLES[selected.status]
    return (
      <div className="space-y-6">
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
          <div className="flex flex-wrap items-center gap-3 justify-between">
            <div className="flex items-center gap-3">
              <button onClick={backToList} className="text-xs font-bold text-slate-500 hover:text-slate-800">
                &larr; Back
              </button>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-lg font-bold text-slate-900 tracking-tight">{selected.subject}</h1>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: st.bg, color: st.color }}>
                    {st.label}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  #{selected.id} &middot; {selected.userName} &lt;{selected.userEmail}&gt; &middot; UID {selected.userId}
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  Opened {new Date(selected.createdAt).toLocaleString()} &middot; Updated {new Date(selected.updatedAt).toLocaleString()}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {selected.status !== 'resolved' && (
                <button
                  onClick={() => changeStatus('resolved')}
                  disabled={!!statusAction}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50"
                >
                  {statusAction === 'resolved' ? '...' : 'Mark Resolved'}
                </button>
              )}
              {selected.status !== 'closed' && (
                <button
                  onClick={() => changeStatus('closed')}
                  disabled={!!statusAction}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 border border-slate-200 hover:bg-slate-50 disabled:opacity-50"
                >
                  {statusAction === 'closed' ? '...' : 'Close Ticket'}
                </button>
              )}
              {selected.status !== 'open' && (
                <button
                  onClick={() => changeStatus('open')}
                  disabled={!!statusAction}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-amber-600 border border-amber-200 hover:bg-amber-50 disabled:opacity-50"
                >
                  {statusAction === 'open' ? '...' : 'Reopen'}
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200/80">
            <h2 className="text-sm font-bold text-slate-900">Conversation</h2>
          </div>
          <div className="p-5 space-y-4">
            <div className="max-w-[85%] rounded-2xl p-4" style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">User • {selected.userName}</p>
              <p className="text-sm text-slate-700 leading-relaxed">{selected.message}</p>
              <p className="text-[10px] text-slate-400 mt-1.5">{new Date(selected.createdAt).toLocaleString()}</p>
            </div>

            {selected.replies.map((r) => {
              const isAdmin = r.from === 'admin'
              return (
                <div
                  key={r.id}
                  className={`max-w-[85%] rounded-2xl p-4 ${isAdmin ? 'ml-auto' : ''}`}
                  style={
                    isAdmin
                      ? { background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.18)' }
                      : { background: '#f8fafc', border: '1px solid #e2e8f0' }
                  }
                >
                  <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: isAdmin ? '#059669' : '#94a3b8' }}>
                    {isAdmin ? 'Support (You)' : `User • ${selected.userName}`}
                  </p>
                  <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{r.message}</p>
                  <p className="text-[10px] text-slate-400 mt-1.5">{new Date(r.date).toLocaleString()}</p>
                </div>
              )
            })}

            {selected.replies.length === 0 && (
              <p className="text-center text-xs text-slate-400 py-4">No replies yet. Respond to the user below.</p>
            )}
          </div>

          <form onSubmit={sendReply} className="px-5 py-4 border-t border-slate-200/80 flex gap-3">
            <input
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              placeholder={selected.status === 'closed' ? 'Ticket closed — reopen it to reply' : 'Type a reply as support...'}
              disabled={selected.status === 'closed'}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none text-slate-900 disabled:bg-slate-50 disabled:text-slate-400"
            />
            <button
              type="submit"
              disabled={!reply.trim() || replying || selected.status === 'closed'}
              className="px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-gradient-to-tr from-emerald-500 to-teal-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {replying ? 'Sending...' : 'Send Reply'}
            </button>
          </form>
        </div>

        {error && <p className="text-sm font-medium text-red-600">{error}</p>}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">Support Tickets & Issue Resolution</h1>
            {tickets.filter((t) => t.status === 'open').length > 0 ? (
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 animate-pulse">
                {tickets.filter((t) => t.status === 'open').length} Open
              </span>
            ) : (
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">All Clear</span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Review user issues, reply to conversations, and resolve or close tickets. Users get a bell notification on every reply.
          </p>
        </div>
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
          {(['all', 'open', 'resolved', 'closed'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold capitalize transition-all cursor-pointer ${
                activeTab === tab ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {tab === 'all' ? 'All Tickets' : tab}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-10 text-center text-sm text-slate-400">
          Loading tickets...
        </div>
      ) : error ? (
        <div className="bg-white rounded-2xl border border-red-200 shadow-sm p-10 text-center text-sm text-red-600">{error}</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-12 text-center">
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-3">
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
          </svg>
          <p className="text-sm text-slate-400">No tickets in this view.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <th className="py-3.5 px-6">Ticket</th>
                  <th className="py-3.5 px-4">User</th>
                  <th className="py-3.5 px-4">Subject</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4">Replies</th>
                  <th className="py-3.5 px-4">Last Update</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => {
                  const st = STATUS_STYLES[t.status]
                  return (
                    <tr
                      key={t.id}
                      onClick={() => openDetail(t)}
                      className="border-b border-slate-100 last:border-0 hover:bg-emerald-50/40 transition-colors cursor-pointer"
                    >
                      <td className="py-3.5 px-6">
                        <span className="text-xs font-mono font-semibold text-slate-700">{t.id}</span>
                      </td>
                      <td className="py-3.5 px-4">
                        <p className="text-sm font-medium text-slate-800">{t.userName}</p>
                        <p className="text-[11px] text-slate-400">{t.userEmail}</p>
                      </td>
                      <td className="py-3.5 px-4">
                        <p className="text-sm font-medium text-slate-800 max-w-[220px] truncate">{t.subject}</p>
                        <p className="text-[11px] text-slate-400 max-w-[220px] truncate">{t.message}</p>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="text-[11px] font-bold px-2 py-1 rounded-full" style={{ background: st.bg, color: st.color }}>
                          {st.label}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-sm text-slate-600">{t.replies.length}</td>
                      <td className="py-3.5 px-4 text-xs text-slate-500">{new Date(t.updatedAt).toLocaleString()}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}