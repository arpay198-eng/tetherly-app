import { NextResponse } from 'next/server';
import { getAuth } from '@/lib/auth';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { getCached, setCached } from '@/lib/apiCache';

export async function GET(request: Request) {
  try {
    const auth = getAuth(request);
    if (!auth) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId') || auth.id;
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const statusFilter = searchParams.get('status') || null;

    if (!auth.isAdmin && userId !== auth.id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const cacheKey = `deposit-history:${userId}:${page}:${limit}:${statusFilter || 'all'}`;
    const cached = getCached<any>(cacheKey, 10000);
    if (cached) {
      return NextResponse.json(cached);
    }

    const adminDb = getAdminDb();
    const snapshot = await adminDb.collection('deposits').where('userId', '==', userId).get();

    let allDeposits: any[] = [];
    snapshot.forEach((doc) => {
      allDeposits.push(doc.data());
    });

    allDeposits.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());

    let totalDeposited = 0;
    let completedCount = 0;
    let pendingCount = 0;
    let failedCount = 0;

    for (const d of allDeposits) {
      const amount = Number(d.amount) || 0;
      if (d.status === 'completed') {
        totalDeposited += amount;
        completedCount++;
      } else if (d.status === 'pending') {
        pendingCount++;
      } else if (d.status === 'failed' || d.status === 'rejected') {
        failedCount++;
      }
    }

    let filteredDeposits = statusFilter
      ? allDeposits.filter((d) => d.status === statusFilter)
      : allDeposits;

    const startIndex = (page - 1) * limit;
    const deposits = filteredDeposits.slice(startIndex, startIndex + limit);
    const hasMore = startIndex + limit < filteredDeposits.length;

    const result = {
      deposits,
      pagination: {
        page,
        limit,
        hasMore,
        total: filteredDeposits.length,
      },
      summary: {
        totalDeposited,
        completedCount,
        pendingCount,
        failedCount,
      },
    };

    setCached(cacheKey, result);
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Deposit history error:', error);
    return NextResponse.json({ error: error?.message || 'Failed to load deposit history' }, { status: 500 });
  }
}
