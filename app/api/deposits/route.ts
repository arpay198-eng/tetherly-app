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
    const clientId = body.id;
    const status = body.status || 'pending';
    const adminDb = getAdminDb();

    // Admin approval/rejection requires the existing deposit ID.
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
        const hashToUse = body.txHash || current.txHash || `admin_${Date.now()}`;
        const outcome = await finalizeDeposit(
          { ...current, id: String(clientId), txHash: hashToUse },
          Number(current.amount ?? body.amount),
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
      const txDirectRef = adminDb.collection('transactions').doc(`tx_${clientId}`);
      const txDirectSnap = await txDirectRef.get();
      if (txDirectSnap.exists) {
        await txDirectRef.update({ status: 'failed', rejectReason: reason });
      }
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

    // New pending deposit submission:
    const { userName, userEmail, date } = body;
    const amount = Number(body.amount);
    const network = body.network || 'BEP20';
    const txHash = String(body.txHash || '').trim();
    const userId = String(auth.isAdmin ? (body.userId || auth.id) : auth.id);

    if (!amount || amount <= 0) {
      return NextResponse.json({ error: 'Amount must be a positive number' }, { status: 400 });
    }

    if (network !== 'BEP20') {
      return NextResponse.json({ error: 'Only BEP20 network is supported' }, { status: 400 });
    }

    if (!txHash) {
      return NextResponse.json({ error: 'Transaction hash is required' }, { status: 400 });
    }

    // Validate BSC transaction hash format: 0x + 64 hex characters.
    const BSC_TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/;
    if (!BSC_TX_HASH_RE.test(txHash)) {
      return NextResponse.json({ error: 'Invalid TxID format. Must be a 66-character BSC hash (0x + 64 hex).' }, { status: 400 });
    }

    // New pending deposit: server-generated ID.
    const depositRef = adminDb.collection('deposits').doc();
    const id = depositRef.id;

    const data: Record<string, unknown> = {
      id,
      userId: String(userId),
      userName: userName || '',
      userEmail: userEmail || '',
      amount: Number(amount),
      network,
      txHash: txHash.trim(),
      status,
      date: date || new Date().toISOString(),
    };
    await depositRef.set(data);

    // Atomically create the pending transaction record on the server
    const txDocRef = adminDb.collection('transactions').doc(`tx_${id}`);
    await txDocRef.set({
      id: `tx_${id}`,
      userId: String(userId),
      type: 'deposit',
      amount: Number(amount),
      network,
      status: 'pending',
      date: data.date,
      hash: txHash.trim(),
    });

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
    const targetUserId = !auth.isAdmin ? String(auth.id) : userId ? String(userId) : null;
    const deposits: any[] = [];

    if (targetUserId) {
      const snap = await adminDb.collection('deposits').where('userId', '==', targetUserId).get();
      snap.forEach((docSnap) => {
        const data = docSnap.data();
        if (status && data.status !== status) return;
        deposits.push(data);
      });
      deposits.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
    } else {
      const q = adminDb.collection('deposits').orderBy('date', 'desc').limit(200);
      const snap = await q.get();
      snap.forEach((docSnap) => {
        const data = docSnap.data();
        if (status && data.status !== status) return;
        deposits.push(data);
      });
    }
    return NextResponse.json(deposits);
  } catch (error) {
    console.error('API deposits GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}