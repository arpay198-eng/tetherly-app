'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';

import { Home, ArrowDownToLine, Gift, Send, User } from 'lucide-react';

const navItems = [
  {
    label: 'Home',
    href: '/dashboard',
    icon: <Home size={22} strokeWidth={2.5} />,
  },
  {
    label: 'Deposit',
    href: '/deposit',
    icon: <ArrowDownToLine size={22} strokeWidth={2.5} />,
  },
  {
    label: 'Bonus',
    href: '/bonus',
    icon: <Gift size={22} strokeWidth={2.5} />,
  },
  {
    label: 'Withdraw',
    href: '/withdraw',
    icon: <Send size={22} strokeWidth={2.5} />,
  },
  {
    label: 'Profile',
    href: '/settings/profile',
    icon: <User size={22} strokeWidth={2.5} />,
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
