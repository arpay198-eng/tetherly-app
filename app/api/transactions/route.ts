import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { getAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const auth = getAuth(request);
    if (!auth) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const body = await request.json();
    const { type, amount, network, status, date, hash } = body;

    if (!type || !amount || !network || !status) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (typeof amount !== 'number' || amount === 0) {
      return NextResponse.json({ error: 'Amount cannot be zero' }, { status: 400 });
    }

    if (network !== 'BEP20') {
      return NextResponse.json({ error: 'Only BEP20 network is supported' }, { status: 400 });
    }

    if (status !== 'completed' && status !== 'pending' && status !== 'failed') {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    // Non-admin users can only create transactions with status='pending'.
    // Only admins can mark transactions as 'completed' or 'failed'.
    if (!auth.isAdmin && status !== 'pending') {
      return NextResponse.json({ error: 'Only admins can set transaction status to completed/failed' }, { status: 403 });
    }

    // Non-admin users can only create transactions for themselves.
    const txUserId = auth.isAdmin ? (body.userId || auth.id) : auth.id;

    const adminDb = getAdminDb();
    let txRef = adminDb.collection('transactions').doc();
    let id = txRef.id;

    if (hash) {
      const existingSnap = await adminDb.collection('transactions')
        .where('userId', '==', String(txUserId))
        .where('hash', '==', String(hash))
        .limit(1)
        .get();
      if (!existingSnap.empty) {
        txRef = existingSnap.docs[0].ref;
        id = existingSnap.docs[0].id;
      }
    }

    const data: Record<string, unknown> = {
      id,
      userId: txUserId,
      type,
      amount,
      network,
      status,
      date: date || new Date().toISOString(),
    };
    if (hash) data.hash = hash;
    await txRef.set(data, { merge: true });

    return NextResponse.json({ success: true, id });
  } catch (error) {
    console.error('API transactions error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const auth = getAuth(request);
    if (!auth) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const type = searchParams.get('type');
    const status = searchParams.get('status');

    const adminDb = getAdminDb();
    const q = adminDb.collection('transactions').orderBy('date', 'desc').limit(100);
    const snap = await q.get();
    const transactions: any[] = [];
    snap.forEach((docSnap) => {
      const data = docSnap.data();
      // Non-admin users can only see their own transactions.
      if (!auth.isAdmin && String(data.userId) !== String(auth.id)) return;
      if (userId && data.userId !== userId) return;
      if (type && data.type !== type) return;
      if (status && data.status !== status) return;
      transactions.push(data);
    });
    return NextResponse.json(transactions);
  } catch (error) {
    console.error('API transactions GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}