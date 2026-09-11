'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/store/useStore';
import MobileNav from '@/components/layout/MobileNav';
import { apiGet, apiPost } from '@/lib/firebaseService';

type TicketStatus = 'open' | 'resolved' | 'closed';

interface Ticket {
  id: string;
  subject: string;
  message: string;
  status: TicketStatus;
  date: string;
  createdAt?: string;
  updatedAt?: string;
  replies: { id?: string; sender: 'user' | 'support'; message: string; date: string }[];
}

const STATUS_STYLES: Record<TicketStatus, { color: string; bg: string; label: string }> = {
  open: { color: '#10b981', bg: 'rgba(16,185,129,0.1)', label: 'Open' },
  resolved: { color: '#06b6d4', bg: 'rgba(6,182,212,0.1)', label: 'Resolved' },
  closed: { color: '#999', bg: '#f3f4f6', label: 'Closed' },
};

export default function SupportPage() {
  const router = useRouter();
  const isLoggedIn = useStore((s) => s.isLoggedIn);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [view, setView] = useState<'list' | 'new' | 'detail'>('list');
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<'all' | TicketStatus>('all');

  const loadTickets = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const list = await apiGet('/support');
      const mapped: Ticket[] = (list || []).map((t: any) => ({
        id: t.id,
        subject: t.subject || '',
        message: t.message || '',
        status: (t.status === 'resolved' ? 'resolved' : t.status === 'closed' ? 'closed' : 'open') as TicketStatus,
        date: t.updatedAt || t.createdAt || new Date().toISOString(),
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
        replies: (t.replies || []).map((r: any) => ({
          id: r.id,
          sender: r.from === 'admin' ? 'support' : 'user',
          message: r.message || '',
          date: r.date || '',
        })),
      }));
      setTickets(mapped);
    } catch (err: any) {
      setError(err?.message || 'Failed to load tickets');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isLoggedIn) {
      router.replace('/auth/login');
      return;
    }
    loadTickets();
  }, [isLoggedIn, router, loadTickets]);

  if (!isLoggedIn) return null;

  const filteredTickets = (filter === 'all' ? tickets : tickets.filter((t) => t.status === filter))
    .sort((a, b) => new Date(b.createdAt || b.date || 0).getTime() - new Date(a.createdAt || a.date || 0).getTime());

  const handleSubmitTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject || !message || busy) return;
    setBusy(true);
    setError('');
    try {
      await apiPost('/support', { action: 'create', subject, message });
      setSubject('');
      setMessage('');
      setView('list');
      await loadTickets();
    } catch (err: any) {
      setError(err?.message || 'Failed to submit ticket');
    } finally {
      setBusy(false);
    }
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reply || !selectedTicket || busy) return;
    setBusy(true);
    setError('');
    try {
      await apiPost('/support', { action: 'reply', id: selectedTicket.id, message: reply });
      setReply('');
      const list = await apiGet('/support');
      const fresh = (list || []).find((t: any) => t.id === selectedTicket.id);
      if (fresh) {
        const mapped: Ticket = {
          id: fresh.id,
          subject: fresh.subject || '',
          message: fresh.message || '',
          status: (fresh.status === 'resolved' ? 'resolved' : fresh.status === 'closed' ? 'closed' : 'open') as TicketStatus,
          date: fresh.updatedAt || fresh.createdAt || new Date().toISOString(),
          createdAt: fresh.createdAt,
          updatedAt: fresh.updatedAt,
          replies: (fresh.replies || []).map((r: any) => ({
            sender: r.from === 'admin' ? 'support' : 'user',
            message: r.message || '',
            date: r.date || '',
          })),
        };
        setSelectedTicket(mapped);
      }
      await loadTickets();
    } catch (err: any) {
      setError(err?.message || 'Failed to send reply');
    } finally {
      setBusy(false);
    }
  };

  const openTicket = (ticket: Ticket) => {
    setSelectedTicket(ticket);
    setView('detail');
  };

  if (view === 'detail' && selectedTicket) {
    const st = STATUS_STYLES[selectedTicket.status];
    return (
      <div className="min-h-screen flex flex-col pb-28" style={{ background: '#f3f5f7' }}>
        <div className="px-5 pt-5 pb-4" style={{ borderBottom: '1px solid #f0f0f0' }}>
          <button onClick={() => setView('list')} className="flex items-center gap-2 mb-3" style={{ color: '#10b981' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            <span className="text-xs font-medium">Back</span>
          </button>
          <h2 className="text-base font-bold mb-1" style={{ color: '#1a1a1a' }}>{selectedTicket.subject}</h2>
          <div className="flex items-center gap-2">
            <span className="text-[10px] px-2 py-0.5 rounded-md font-medium" style={{ background: st.bg, color: st.color }}>
              {st.label}
            </span>
            <span className="text-[10px]" style={{ color: '#ccc' }}>
              #{selectedTicket.id} &middot; {new Date(selectedTicket.date).toLocaleString()}
            </span>
          </div>
        </div>

        <div className="flex-1 px-5 py-4 flex flex-col gap-3">
          {error && <p className="text-xs font-medium" style={{ color: '#dc2626' }}>{error}</p>}
          <div className="p-3 rounded-xl" style={{ background: '#fff', border: '1px solid #f0f0f0' }}>
            <p className="text-[10px] font-medium mb-1" style={{ color: '#999' }}>You</p>
            <p className="text-xs leading-relaxed" style={{ color: '#555' }}>{selectedTicket.message}</p>
            <p className="text-[9px] mt-1" style={{ color: '#ccc' }}>{selectedTicket.createdAt ? new Date(selectedTicket.createdAt).toLocaleString() : new Date(selectedTicket.date).toLocaleString()}</p>
          </div>
          {selectedTicket.replies.map((r, i) => (
            <div key={r.id || i} className="p-3 rounded-xl" style={{ background: r.sender === 'support' ? 'rgba(16,185,129,0.05)' : '#fff', border: r.sender === 'support' ? '1px solid rgba(16,185,129,0.1)' : '1px solid #f0f0f0' }}>
              <p className="text-[10px] font-medium mb-1" style={{ color: r.sender === 'support' ? '#10b981' : '#999' }}>{r.sender === 'support' ? 'Support' : 'You'}</p>
              <p className="text-xs leading-relaxed" style={{ color: '#555' }}>{r.message}</p>
              <p className="text-[9px] mt-1" style={{ color: '#ccc' }}>{new Date(r.date).toLocaleString()}</p>
            </div>
          ))}
        </div>

        {selectedTicket.status === 'open' && (
          <form onSubmit={handleSendReply} className="px-5 py-4" style={{ borderTop: '1px solid #f0f0f0' }}>
            <div className="flex gap-2">
              <input
                type="text"
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder="Type a reply..."
                disabled={busy}
                className="flex-1 px-4 py-3 rounded-xl text-sm input-premium"
                style={{ color: '#1a1a1a' }}
              />
              <button type="submit" disabled={busy || !reply.trim()} className="w-11 h-11 rounded-xl flex items-center justify-center btn-premium" style={{ color: '#fff' }}>
                {busy ? (
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                )}
              </button>
            </div>
          </form>
        )}
        <MobileNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-28" style={{ background: '#f3f5f7' }}>
      <div className="px-5 pt-5 pb-6">
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-xl font-bold" style={{ color: '#1a1a1a' }}>Support</h1>
          {view !== 'new' && (
            <button onClick={() => { setView('new'); setError(''); }} className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg btn-premium text-white">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              New Ticket
            </button>
          )}
        </div>

        {error && view !== 'new' && <p className="text-xs font-medium mb-3" style={{ color: '#dc2626' }}>{error}</p>}

        {view === 'new' ? (
          <div className="rounded-2xl p-5 card-premium">
            <div className="flex items-center gap-2 mb-4">
              <button onClick={() => setView('list')} style={{ color: '#10b981' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
              </button>
              <h2 className="text-sm font-semibold" style={{ color: '#1a1a1a' }}>New Support Ticket</h2>
            </div>
            {error && <p className="text-xs font-medium mb-3" style={{ color: '#dc2626' }}>{error}</p>}
            <form onSubmit={handleSubmitTicket} className="flex flex-col gap-3">
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: '#888' }}>Subject</label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Brief description"
                  maxLength={120}
                  className="w-full px-4 py-3 rounded-xl text-sm input-premium"
                  style={{ color: '#1a1a1a' }}
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: '#888' }}>Message</label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Describe your issue..."
                  rows={4}
                  maxLength={3000}
                  className="w-full px-4 py-3 rounded-xl text-sm input-premium resize-none"
                  style={{ color: '#1a1a1a' }}
                />
              </div>
              {error && <p className="text-xs font-medium" style={{ color: '#dc2626' }}>{error}</p>}
              <button type="submit" disabled={busy || !subject.trim() || !message.trim()} className="w-full py-3 rounded-xl text-sm font-semibold btn-premium text-white disabled:opacity-50">
                {busy ? 'Submitting...' : 'Submit Ticket'}
              </button>
            </form>
          </div>
        ) : (
          <>
            <div className="flex gap-1.5 p-1 rounded-xl mb-4" style={{ background: '#f9fafb', border: '1px solid #f0f0f0' }}>
              {(['all', 'open', 'resolved', 'closed'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className="flex-1 py-2 rounded-lg text-xs font-medium capitalize transition-all"
                  style={{
                    background: filter === f ? 'rgba(16,185,129,0.15)' : 'transparent',
                    color: filter === f ? '#10b981' : '#999',
                  }}
                >
                  {f}
                </button>
              ))}
            </div>

            {loading ? (
              <div className="text-center py-12">
                <div className="w-8 h-8 rounded-full border-4 border-emerald-200 border-t-emerald-600 animate-spin mx-auto mb-3" />
                <p className="text-sm" style={{ color: '#bbb' }}>Loading tickets...</p>
              </div>
            ) : filteredTickets.length === 0 ? (
              <div className="text-center py-12">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-3">
                  <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                </svg>
                <p className="text-sm" style={{ color: '#bbb' }}>No tickets found</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {filteredTickets.map((ticket) => {
                  const st = STATUS_STYLES[ticket.status];
                  return (
                    <button key={ticket.id} onClick={() => openTicket(ticket)} className="flex items-start gap-3 p-4 rounded-xl text-left card-premium">
                      <div className="w-10 h-10 rounded-xl flex-none flex items-center justify-center" style={{ background: st.bg }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={st.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium mb-0.5 truncate" style={{ color: '#1a1a1a' }}>{ticket.subject}</p>
                        <p className="text-xs truncate mb-1" style={{ color: '#999' }}>{ticket.message}</p>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ background: st.bg, color: st.color }}>
                            {st.label}
                          </span>
                          <span className="text-[10px]" style={{ color: '#ccc' }}>
                            #{ticket.id} &middot; {new Date(ticket.date).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-none mt-1"><polyline points="9 18 15 12 9 6"/></svg>
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
      <MobileNav />
    </div>
  );
}