import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { triggerAutoVerify } from '@/lib/autoVerifyScheduler';
import { finalizeDeposit } from '@/lib/autoVerifyCore';
import { getAuth } from '@/lib/auth';
import { pushNotification } from '@/lib/notifications';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const auth = getAuth(request);
    if (!auth) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const body = await request.json();
    const { id, userId, userName, userEmail, amount, network, txHash, status, date } = body;

    if (!userId || !amount || !network || !txHash || !status) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (typeof amount !== 'number' || amount <= 0) {
      return NextResponse.json({ error: 'Amount must be a positive number' }, { status: 400 });
    }

    if (network !== 'BEP20') {
      return NextResponse.json({ error: 'Only BEP20 network is supported' }, { status: 400 });
    }

    if (status !== 'pending' && status !== 'completed' && status !== 'rejected') {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    if (!txHash || txHash.trim().length === 0) {
      return NextResponse.json({ error: 'Transaction hash is required' }, { status: 400 });
    }

    const adminDb = getAdminDb();

    if (status === 'pending') {
      if (!auth.isAdmin && userId !== auth.id) {
        return NextResponse.json({ error: 'You can only submit deposits for your own account' }, { status: 403 });
      }
    } else if (!auth.isAdmin) {
      return NextResponse.json({ error: 'Only admins can change deposit status' }, { status: 403 });
    }

    const depositRef = adminDb.collection('deposits').doc(String(id));

    // Admin approval performs the real server-side credit (balance + depositBalance
    // + 24h lock anchor + referral bonus), identically to auto-verify. This keeps
    // the financial state consistent no matter who finalizes the deposit.
    if (status === 'completed') {
      if (!auth.isAdmin) {
        return NextResponse.json({ error: 'Only admins can change deposit status' }, { status: 403 });
      }
      const existing = await depositRef.get();
      if (!existing.exists) {
        return NextResponse.json({ error: 'Deposit request not found' }, { status: 404 });
      }
      const current: any = existing.data();
      if (current.status !== 'pending') {
        return NextResponse.json({ error: 'Deposit is already processed' }, { status: 400 });
      }
      const hashToUse = txHash || current.txHash || `admin_${Date.now()}`;
      const outcome = await finalizeDeposit(
        { ...current, id: String(id), txHash: hashToUse },
        Number(current.amount ?? amount),
        hashToUse,
        'admin'
      );
      return NextResponse.json({ success: true, id, verified: outcome.verified, credited: outcome.credited, reason: outcome.reason });
    }

    const data: Record<string, unknown> = {
      id,
      userId,
      userName: userName || '',
      userEmail: userEmail || '',
      amount,
      network,
      txHash: txHash.trim(),
      status,
      date: date || new Date().toISOString(),
    };
    if (body.reviewedAt) data.reviewedAt = body.reviewedAt;
    if (body.reviewedBy) data.reviewedBy = body.reviewedBy;
    if (body.rejectReason) data.rejectReason = body.rejectReason;
    await depositRef.set(data, { merge: true });

    if (status === 'pending') {
      pushNotification(
        String(userId),
        'Deposit Submitted',
        `Your deposit of ${Number(amount).toFixed(2)} USDT (${network}) was submitted. We are verifying your payment.`,
        'info'
      );
      triggerAutoVerify();
    }

    return NextResponse.json({ success: true, id });
  } catch (error) {
    console.error('API deposits error:', error);
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
    const status = searchParams.get('status');

    const adminDb = getAdminDb();
    const q = adminDb.collection('deposits').orderBy('date', 'desc').limit(100);
    const snap = await q.get();
    const deposits: any[] = [];
    snap.forEach((docSnap) => {
      const data = docSnap.data();
      // Non-admins can only read their own deposits.
      if (!auth.isAdmin && String(data.userId || '') !== String(auth.id) && String(userId || '') !== String(auth.id)) return;
      if (userId && auth.isAdmin && data.userId !== userId) return;
      if (status && data.status !== status) return;
      deposits.push(data);
    });
    return NextResponse.json(deposits);
  } catch (error) {
    console.error('API deposits GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}