'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';

const navItems = [
  {
    label: 'Home',
    href: '/dashboard',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M3 10.5L12 3L21 10.5V20C21 20.55 20.55 21 20 21H15V15H9V21H4C3.45 21 3 20.55 3 20V10.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M9 15H15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    label: 'Deposit',
    href: '/deposit',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="3" y="6" width="18" height="14" rx="3" stroke="currentColor" strokeWidth="1.8"/>
        <path d="M3 11H21" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
        <path d="M12 15V18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
        <path d="M9 16.5H15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
        <circle cx="12" cy="9" r="1.5" fill="currentColor"/>
      </svg>
    ),
  },
  {
    label: 'Bonus',
    href: '/bonus',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2L14.5 8.5L21.5 9.5L16.5 14L18 21L12 17.5L6 21L7.5 14L2.5 9.5L9.5 8.5L12 2Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 2"/>
      </svg>
    ),
  },
  {
    label: 'Withdraw',
    href: '/withdraw',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8"/>
        <path d="M12 8V16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
        <path d="M8.5 12.5L12 16L15.5 12.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    label: 'Profile',
    href: '/settings/profile',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.8"/>
        <path d="M5 20C5 17.24 7.24 15 10 15H14C16.76 15 19 17.24 19 20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
      </svg>
    ),
  },
];

export default function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-3 left-1/2 -translate-x-1/2 z-50 w-full max-w-[440px] px-4">
      <div
        className="flex items-center justify-around rounded-[20px] px-2 py-2"
        style={{
          background: 'rgba(255,255,255,0.98)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(0,0,0,0.05)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.04)',
        }}
      >
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex flex-col items-center gap-0.5 px-3 py-2 rounded-2xl transition-all duration-300 relative"
              style={{
                color: isActive ? '#10b981' : '#b0b0b0',
              }}
            >
              <div
                className="transition-all duration-300"
                style={{
                  transform: isActive ? 'scale(1.15) translateY(-2px)' : 'scale(1)',
                  filter: isActive ? 'drop-shadow(0 3px 6px rgba(16,185,129,0.35))' : 'none',
                }}
              >
                {item.icon}
              </div>
              <span
                className="text-[9px] leading-none transition-all duration-300"
                style={{
                  fontWeight: isActive ? '700' : '500',
                }}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
