'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/store/useStore';
import { apiGet } from '@/lib/firebaseService';
import MobileNav from '@/components/layout/MobileNav';

export default function ReferralPage() {
  const router = useRouter();
  const isLoggedIn = useStore((s) => s.isLoggedIn);
  const user = useStore((s) => s.user);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [referredUsers, setReferredUsers] = useState<any[]>([]);
  const [level2Users, setLevel2Users] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isLoggedIn) router.replace('/auth/login');
  }, [isLoggedIn, router]);

  useEffect(() => {
    if (!isLoggedIn || !user) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await apiGet(`/users?referredBy=${encodeURIComponent(user.id)}`);
        const l1: any[] = Array.isArray(data) ? data : [];
        if (!cancelled) setReferredUsers(l1);
        const l2: any[] = [];
        for (const u of l1) {
          try {
            const d2 = await apiGet(`/users?referredBy=${encodeURIComponent(u.id)}`);
            if (Array.isArray(d2)) d2.forEach((u2: any) => l2.push({ ...u2, via: u }));
          } catch (e) { /* skip */ }
        }
        if (!cancelled) setLevel2Users(l2);
      } catch (e) {
        console.warn('Failed to load referrals:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isLoggedIn, user]);

  if (!isLoggedIn || !user) return null;

  const referralCode = user.referralCode || 'TETH001';
  const referralLink = `${window.location.origin}/auth/register?ref=${referralCode}`;
  const totalEarned = user.referralEarned || 0;
  const totalEarnedL2 = user.referralEarnedLevel2 || 0;

  const handleCopyCode = () => {
    navigator.clipboard.writeText(referralCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(referralLink);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: 'Join Tetherly',
        text: `Use my referral code ${referralCode} to join Tetherly and earn bonuses!`,
        url: referralLink,
      });
    }
  };

  return (
    <div className="min-h-screen pb-28" style={{ background: '#f3f5f7' }}>
      <div className="px-5 pt-5 pb-6">
        <h1 className="text-xl font-bold mb-5" style={{ color: '#1a1a1a' }}>Referral Program</h1>

        <div className="relative rounded-2xl p-6 mb-5 overflow-hidden" style={{ background: 'linear-gradient(135deg, #e8fff1 0%, #e0f2fe 50%, #f3e8ff 100%)', border: '1px solid rgba(16,185,129,0.12)' }}>
          <div className="absolute top-0 right-0 w-40 h-40 rounded-full" style={{ background: 'radial-gradient(circle, rgba(16,185,129,0.12) 0%, transparent 70%)' }} />
          <div className="relative">
            <div className="flex items-center gap-2 mb-4">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 00-3-3.87" />
                <path d="M16 3.13a4 4 0 010 7.75" />
              </svg>
              <span className="text-sm font-semibold" style={{ color: '#1a1a1a' }}>Your Referral Code</span>
            </div>
            <div className="flex items-center gap-2 p-3 rounded-xl mb-4" style={{ background: '#fff', border: '1px solid #e5e7eb' }}>
              <span className="flex-1 text-lg font-bold tracking-wider font-mono" style={{ color: '#10b981' }}>{referralCode}</span>
              <button onClick={handleCopyCode} className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: copiedCode ? 'rgba(16,185,129,0.15)' : '#f9fafb' }}>
                {copiedCode ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                )}
              </button>
            </div>
            <div className="flex items-center gap-2 p-3 rounded-xl mb-4" style={{ background: '#fff', border: '1px solid #f0f0f0' }}>
              <span className="flex-1 text-xs font-mono truncate" style={{ color: '#888' }}>{referralLink}</span>
              <button onClick={handleCopyLink} className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: copiedLink ? 'rgba(16,185,129,0.15)' : '#f9fafb' }}>
                {copiedLink ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                ) : (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                )}
              </button>
            </div>
            <button onClick={handleShare} className="w-full py-3 rounded-xl text-sm font-semibold btn-premium text-white flex items-center justify-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
              </svg>
              Share Referral Link
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-5">
          <div className="rounded-2xl p-4 card-premium">
            <div className="flex items-center gap-2 mb-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
              <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#999' }}>Referrals</span>
            </div>
            <p className="text-2xl font-bold tabular-nums" style={{ color: '#1a1a1a' }}>{referredUsers.length}</p>
            <p className="text-[10px]" style={{ color: '#bbb' }}>direct referrals</p>
          </div>
          <div className="rounded-2xl p-4 card-premium">
            <div className="flex items-center gap-2 mb-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
              <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#999' }}>Earned</span>
            </div>
            <p className="text-2xl font-bold tabular-nums" style={{ color: '#10b981' }}>${(totalEarned ?? 0).toLocaleString('en-US')}</p>
            <p className="text-[10px]" style={{ color: '#bbb' }}>0.75%/day · Level 1</p>
          </div>
        </div>

        {totalEarnedL2 > 0 && (
          <div className="rounded-2xl p-4 mb-5 card-premium" style={{ borderLeft: '3px solid #06b6d4' }}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: '#999' }}>Level 2 Earnings</p>
                <p className="text-xl font-bold tabular-nums" style={{ color: '#06b6d4' }}>${(totalEarnedL2.toLocaleString('en-US'))}</p>
              </div>
              <p className="text-[10px] text-right" style={{ color: '#bbb' }}>0.25%/day<br/>from referrals&apos; referrals</p>
            </div>
          </div>
        )}

        <div className="rounded-2xl p-4 mb-5" style={{ background: '#fff7ed', border: '1px solid #fed7aa' }}>
          <p className="text-xs font-semibold mb-1" style={{ color: '#c2410c' }}>Daily Bonus</p>
          <p className="text-[11px] leading-relaxed" style={{ color: '#9a3412' }}>
            Level 1: <b>0.75%</b> of each referral&apos;s balance, daily.<br />
            Level 2: <b>0.25%</b> of each referral&apos;s referrals&apos; balance, daily.<br />
            Withdrawing reduces your bonus. Bonus is added to your balance.
          </p>
        </div>

        <div className="mb-4">
          {user.referredByName && (
            <p className="text-xs mb-3" style={{ color: '#888' }}>
              Invited by <span className="font-semibold" style={{ color: '#10b981' }}>{user.referredByName}</span>
            </p>
          )}
        </div>

        <div className="rounded-2xl p-4 card-premium">
          <h3 className="text-sm font-semibold mb-3" style={{ color: '#1a1a1a' }}>Referred Users</h3>
          {loading ? (
            <p className="text-xs text-center py-6" style={{ color: '#bbb' }}>Loading...</p>
          ) : referredUsers.length === 0 ? (
            <div className="text-center py-6">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-2">
                <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 00-3-3.87" />
                <path d="M16 3.13a4 4 0 010 7.75" />
              </svg>
              <p className="text-xs" style={{ color: '#bbb' }}>No referrals yet. Share your code to earn 0.75% daily!</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {referredUsers.map((u) => (
                <div key={u.id} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: '#fff' }}>
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: 'rgba(6,182,212,0.1)' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#06b6d4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-medium" style={{ color: '#1a1a1a' }}>{u.name}</p>
                    <p className="text-[10px]" style={{ color: '#999' }}>Joined {u.joinedDate || '—'}</p>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-md" style={{ background: Number(u.balance) > 0 ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)', color: Number(u.balance) > 0 ? '#059669' : '#d97706' }}>
                    {Number(u.balance) > 0 ? 'Deposited' : 'Pending'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {level2Users.length > 0 && (
          <div className="rounded-2xl p-4 card-premium mt-4">
            <h3 className="text-sm font-semibold mb-1" style={{ color: '#1a1a1a' }}>Level 2 Referrals</h3>
            <p className="text-[10px] mb-3" style={{ color: '#bbb' }}>your referrals&apos; referrals — earn 0.25%/day on their balance</p>
            <div className="flex flex-col gap-2">
              {level2Users.map((u) => (
                <div key={u.id} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: '#fff' }}>
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: 'rgba(139,92,246,0.1)' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-medium" style={{ color: '#1a1a1a' }}>{u.name}</p>
                    <p className="text-[10px]" style={{ color: '#999' }}>via {u.via?.name || '—'}</p>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-md" style={{ background: Number(u.balance) > 0 ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)', color: Number(u.balance) > 0 ? '#059669' : '#d97706' }}>
                    {Number(u.balance) > 0 ? 'Deposited' : 'Pending'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <MobileNav />
    </div>
  );
}