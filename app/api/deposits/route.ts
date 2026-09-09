import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { triggerAutoVerify } from '@/lib/autoVerifyScheduler';
import { finalizeDeposit } from '@/lib/autoVerifyCore';
import { getAuth } from '@/lib/auth';
import { pushNotification } from '@/lib/notifications';
import { checkRateLimit } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const auth = getAuth(request);
    if (!auth) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    // Rate limit: 10 deposit submissions per minute per user.
    const rl = checkRateLimit(`deposits:${auth.id}`, 10, 60_000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: `Too many requests. Try again in ${Math.ceil(rl.retryAfterMs / 1000)}s.` },
        { status: 429 },
      );
    }

    const body = await request.json();
    const { userId, userName, userEmail, amount, network, txHash, status, date } = body;
    // Admin approval sends the existing deposit ID; new pending deposits don't send one.
    const clientId = body.id;

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

    // Validate BSC transaction hash format: 0x + 64 hex characters.
    const BSC_TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/;
    if (!BSC_TX_HASH_RE.test(txHash.trim())) {
      return NextResponse.json({ error: 'Invalid TxID format. Must be a 66-character BSC hash (0x + 64 hex).' }, { status: 400 });
    }

    const adminDb = getAdminDb();

    if (status === 'pending') {
      if (!auth.isAdmin && userId !== auth.id) {
        return NextResponse.json({ error: 'You can only submit deposits for your own account' }, { status: 403 });
      }
    } else if (!auth.isAdmin) {
      return NextResponse.json({ error: 'Only admins can change deposit status' }, { status: 403 });
    }

    // Admin approval requires the existing deposit ID.
    if (status === 'completed' || status === 'rejected') {
      if (!clientId) {
        return NextResponse.json({ error: 'Deposit id is required for admin approval/rejection' }, { status: 400 });
      }
      if (!auth.isAdmin) {
        return NextResponse.json({ error: 'Only admins can change deposit status' }, { status: 403 });
      }
      const depositRef = adminDb.collection('deposits').doc(String(clientId));
      const existing = await depositRef.get();
      if (!existing.exists) {
        return NextResponse.json({ error: 'Deposit request not found' }, { status: 404 });
      }
      const current: any = existing.data();
      if (current.status !== 'pending') {
        return NextResponse.json({ error: 'Deposit is already processed' }, { status: 400 });
      }

      if (status === 'completed') {
        const hashToUse = txHash || current.txHash || `admin_${Date.now()}`;
        const outcome = await finalizeDeposit(
          { ...current, id: String(clientId), txHash: hashToUse },
          Number(current.amount ?? amount),
          hashToUse,
          'admin'
        );
        return NextResponse.json({ success: true, id: clientId, verified: outcome.verified, credited: outcome.credited, reason: outcome.reason });
      }

      // status === 'rejected'
      const reason = body.rejectReason || 'Rejected by admin';
      await depositRef.set({
        status: 'rejected',
        rejectReason: reason,
        reviewedAt: new Date().toISOString(),
      }, { merge: true });

      // Atomically update matching transactions from pending to failed
      if (current.txHash) {
        const txSnap = await adminDb.collection('transactions')
          .where('hash', '==', current.txHash)
          .get();
        if (!txSnap.empty) {
          const batch = adminDb.batch();
          txSnap.forEach((doc) => {
            batch.update(doc.ref, { status: 'failed', rejectReason: reason });
          });
          await batch.commit();
        }
      }

      await pushNotification(
        String(current.userId),
        'Deposit Rejected',
        `Your deposit of ${Number(current.amount).toFixed(2)} USDT was rejected: ${reason}.`,
        'warning'
      );

      return NextResponse.json({ success: true, id: clientId, status: 'rejected' });
    }

    // New pending deposit: server-generated ID.
    const depositRef = adminDb.collection('deposits').doc();
    const id = depositRef.id;

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
    await depositRef.set(data);

    pushNotification(
      String(userId),
      'Deposit Submitted',
      `Your deposit of ${Number(amount).toFixed(2)} USDT (${network}) was submitted. We are verifying your payment.`,
      'info'
    );
    triggerAutoVerify();

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