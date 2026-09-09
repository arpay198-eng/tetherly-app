'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const target = pathname ? pathname.replace(/^\/admin/, '/tetherly-master-control') : '/tetherly-master-control';
    router.replace(target || '/tetherly-master-control');
  }, [pathname, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 text-slate-300 text-sm font-medium">
      Redirecting to Tetherly Master Control...
    </div>
  );
}
