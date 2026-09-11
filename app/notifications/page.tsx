'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/store/useStore';
import MobileNav from '@/components/layout/MobileNav';

export default function NotificationsPage() {
  const router = useRouter();
  const isLoggedIn = useStore((s) => s.isLoggedIn);
  const notifications = useStore((s) => s.notifications);
  const markNotificationRead = useStore((s) => s.markNotificationRead);
  const markAllRead = useStore((s) => s.markAllRead);
  const loadNotifications = useStore((s) => s.loadNotifications);

  useEffect(() => {
    if (!isLoggedIn) {
      router.replace('/auth/login');
      return;
    }
    void loadNotifications();
    const interval = setInterval(() => {
      void loadNotifications();
    }, 5000);
    return () => clearInterval(interval);
  }, [isLoggedIn, router, loadNotifications]);

  if (!isLoggedIn) return null;

  const sortedNotifications = [...notifications].sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
  const unreadCount = sortedNotifications.filter((n) => !n.read).length;

  const getIcon = (type: string) => {
    switch (type) {
      case 'success':
        return (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
        );
      case 'warning':
        return (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        );
      case 'error':
        return (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
        );
      case 'info':
      default:
        return (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
        );
    }
  };

  const getIconBg = (type: string) => {
    switch (type) {
      case 'success': return 'rgba(16,185,129,0.1)';
      case 'warning': return 'rgba(245,158,11,0.1)';
      case 'error': return 'rgba(239,68,68,0.1)';
      case 'info': return 'rgba(59,130,246,0.1)';
      default: return '#f9fafb';
    }
  };

  return (
    <div className="min-h-screen pb-28" style={{ background: '#f3f5f7' }}>
      <div className="px-5 pt-5 pb-6">
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-xl font-bold" style={{ color: '#1a1a1a' }}>Notifications</h1>
          {unreadCount > 0 && (
            <button onClick={markAllRead} className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg" style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              Mark all read
            </button>
          )}
        </div>

        {unreadCount > 0 && (
          <div className="mb-4 text-xs font-semibold" style={{ color: '#999' }}>{unreadCount} unread notification{unreadCount > 1 ? 's' : ''}</div>
        )}

        {notifications.length === 0 ? (
          <div className="text-center py-16">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-3">
              <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 01-3.46 0" />
            </svg>
            <p className="text-sm" style={{ color: '#bbb' }}>No notifications yet</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {sortedNotifications.map((n) => (
              <div
                key={n.id}
                onClick={() => markNotificationRead(n.id)}
                className="flex items-start gap-3 p-4 rounded-xl cursor-pointer transition-all"
                style={{
                  background: n.read ? '#fff' : 'rgba(16,185,129,0.03)',
                  border: n.read ? '1px solid #f0f0f0' : '1px solid rgba(16,185,129,0.08)',
                }}
              >
                <div className="w-10 h-10 rounded-xl flex-none flex items-center justify-center" style={{ background: getIconBg(n.type) }}>
                  {getIcon(n.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="text-sm font-semibold truncate" style={{ color: '#1a1a1a' }}>{n.title}</p>
                    {!n.read && (
                      <div className="w-1.5 h-1.5 rounded-full flex-none" style={{ background: '#10b981' }} />
                    )}
                  </div>
                  <p className="text-xs leading-relaxed" style={{ color: '#888' }}>{n.message}</p>
                  <p className="text-[10px] mt-1.5" style={{ color: '#ccc' }}>
                    {new Date(n.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <MobileNav />
    </div>
  );
}
