import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { triggerAutoVerify } from '@/lib/autoVerifyScheduler';
import { finalizeDeposit } from '@/lib/autoVerifyCore';
import { getAuth } from '@/lib/auth';
import { pushNotification } from '@/lib/notifications';
import { checkRateLimit } from '@/lib/rateLimit';
import {
  getCached,
  setCached,
  getFallback,
  invalidateCache,
  getDepositsList,
  saveDepositRecord,
  saveTransactionRecord,
  saveUserRecord,
} from '@/lib/apiCache';

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
      let current: any = null;
      try {
        const existing = await depositRef.get();
        if (existing.exists) current = existing.data();
      } catch (e: any) {
        console.warn('Firestore depositRef.get error (falling back to cache):', e?.message);
      }
      if (!current) {
        current = getDepositsList().find((d) => String(d.id) === String(clientId));
      }
      if (!current) {
        return NextResponse.json({ error: 'Deposit request not found' }, { status: 404 });
      }
      if (current.status !== 'pending') {
        return NextResponse.json({ error: 'Deposit is already processed' }, { status: 400 });
      }

      if (status === 'completed') {
        const hashToUse = body.txHash || current.txHash || `admin_${Date.now()}`;
        const depositAmount = Number(current.amount ?? body.amount);
        let outcome: any = { verified: true, credited: true };
        try {
          outcome = await finalizeDeposit(
            { ...current, id: String(clientId), txHash: hashToUse },
            depositAmount,
            hashToUse,
            'admin'
          );
        } catch (fErr: any) {
          const errMsg = fErr?.message || '';
          if (errMsg === 'not_pending' || errMsg === 'deposit_missing') {
            return NextResponse.json({ error: 'Deposit already processed or not found' }, { status: 400 });
          }
          console.warn('finalizeDeposit error (falling back to direct credit):', errMsg);
          // Fallback: directly credit balance + write deposit + transaction
          await depositRef.set({ status: 'completed', txHash: hashToUse, reviewedAt: new Date().toISOString(), reviewedBy: 'admin' }, { merge: true });

          if (current.userId) {
            const userRef = adminDb.collection('users').doc(String(current.userId));
            const userSnap = await userRef.get();
            const userData = userSnap.exists ? userSnap.data()! : {};
            const curBal = Number(userData.balance || 0);
            const curDep = userData.depositBalance !== undefined ? Number(userData.depositBalance) : curBal;
            await userRef.set({
              balance: curBal + depositAmount,
              depositBalance: curDep + depositAmount,
              lastDepositDate: new Date().toISOString(),
              lastDepositAmount: depositAmount,
              bonusClaimed: false,
            }, { merge: true });
            saveUserRecord({ id: current.userId, balance: curBal + depositAmount, depositBalance: curDep + depositAmount });
          }

          // Write transaction record
          const txDocRef = adminDb.collection('transactions').doc(`tx_${clientId}`);
          await txDocRef.set({
            id: `tx_${clientId}`,
            userId: String(current.userId || ''),
            type: 'deposit',
            amount: depositAmount,
            network: current.network || 'BEP20',
            status: 'completed',
            date: current.date || new Date().toISOString(),
            hash: hashToUse,
          }, { merge: true });
          saveTransactionRecord({ id: `tx_${clientId}`, userId: String(current.userId || ''), type: 'deposit', amount: depositAmount, network: current.network || 'BEP20', status: 'completed', date: current.date || new Date().toISOString(), hash: hashToUse });

          outcome = { verified: true, credited: true };
        }

        if (outcome.credited === false) {
          // Admin approval: always credit even if finalizeDeposit failed
          console.warn('finalizeDeposit returned credited=false, using direct credit fallback. reason:', outcome.reason);
          await depositRef.set({ status: 'completed', txHash: hashToUse, reviewedAt: new Date().toISOString(), reviewedBy: 'admin' }, { merge: true });

          if (current.userId) {
            const userRef = adminDb.collection('users').doc(String(current.userId));
            const userSnap = await userRef.get();
            const userData = userSnap.exists ? userSnap.data()! : {};
            const curBal = Number(userData.balance || 0);
            const curDep = userData.depositBalance !== undefined ? Number(userData.depositBalance) : curBal;
            await userRef.set({
              balance: curBal + depositAmount,
              depositBalance: curDep + depositAmount,
              lastDepositDate: new Date().toISOString(),
              lastDepositAmount: depositAmount,
              bonusClaimed: false,
            }, { merge: true });
            saveUserRecord({ id: current.userId, balance: curBal + depositAmount, depositBalance: curDep + depositAmount });
          }

          const txDocRef = adminDb.collection('transactions').doc(`tx_${clientId}`);
          await txDocRef.set({
            id: `tx_${clientId}`,
            userId: String(current.userId || ''),
            type: 'deposit',
            amount: depositAmount,
            network: current.network || 'BEP20',
            status: 'completed',
            date: current.date || new Date().toISOString(),
            hash: hashToUse,
          }, { merge: true });
          saveTransactionRecord({ id: `tx_${clientId}`, userId: String(current.userId || ''), type: 'deposit', amount: depositAmount, network: current.network || 'BEP20', status: 'completed', date: current.date || new Date().toISOString(), hash: hashToUse });

          outcome = { verified: true, credited: true };
        }

        saveDepositRecord({ ...current, id: String(clientId), status: 'completed', txHash: hashToUse });
        invalidateCache('deposits:');
        invalidateCache('users:');
        invalidateCache('transactions:');
        return NextResponse.json({ success: true, id: clientId, verified: outcome.verified, credited: outcome.credited, reason: outcome.reason });
      }

      // status === 'rejected'
      const reason = body.rejectReason || 'Rejected by admin';
      try {
        await depositRef.set({
          status: 'rejected',
          rejectReason: reason,
          reviewedAt: new Date().toISOString(),
        }, { merge: true });

        // Atomically update matching transactions from pending to failed
        const txDirectRef = adminDb.collection('transactions').doc(`tx_${clientId}`);
        await txDirectRef.set({ status: 'failed', rejectReason: reason }, { merge: true });
      } catch (rErr: any) {
        console.warn('deposit reject set error:', rErr?.message);
      }

      saveDepositRecord({ ...current, id: String(clientId), status: 'rejected', rejectReason: reason });
      saveTransactionRecord({ id: `tx_${clientId}`, status: 'failed', rejectReason: reason });

      if (current.txHash) {
        try {
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
        } catch {}
      }

      await pushNotification(
        String(current.userId),
        'Deposit Rejected',
        `Your deposit of ${Number(current.amount).toFixed(2)} USDT was rejected: ${reason}.`,
        'warning'
      );

      invalidateCache('deposits:');
      invalidateCache('transactions:');
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

    // Atomic duplicate hash check + deposit creation using Firestore transaction
    const trimmedHash = txHash.trim();
    const hashRef = adminDb.collection('used_hashes').doc(trimmedHash.toLowerCase());
    const newDepositRef = adminDb.collection('deposits').doc();
    const newTxRef = adminDb.collection('transactions').doc(`tx_${newDepositRef.id}`);

    try {
      await adminDb.runTransaction(async (tx) => {
        // Check if hash already used — atomically
        const hashSnap = await tx.get(hashRef);
        if (hashSnap.exists) {
          throw new Error('This transaction hash has already been submitted.');
        }

        // Mark hash as used — atomic claim
        const depositId = newDepositRef.id;
        tx.set(hashRef, { depositId, usedAt: new Date().toISOString(), userId: String(userId) });

        // Create deposit record
        const depositData = {
          id: depositId,
          userId: String(userId),
          userName: userName || '',
          userEmail: userEmail || '',
          amount: Number(amount),
          network,
          txHash: trimmedHash,
          status,
          date: date || new Date().toISOString(),
        };
        tx.set(newDepositRef, depositData);

        // Create transaction record
        tx.set(newTxRef, {
          id: `tx_${depositId}`,
          userId: String(userId),
          type: 'deposit',
          amount: Number(amount),
          network,
          status: 'pending',
          date: depositData.date,
          hash: trimmedHash,
        });
      });
    } catch (txErr: any) {
      if (txErr?.message?.includes('already been submitted')) {
        return NextResponse.json({ error: txErr.message }, { status: 400 });
      }
      return NextResponse.json({ error: 'Deposit submission failed. Please try again.' }, { status: 500 });
    }

    const id = newDepositRef.id;
    const depositDate = date || new Date().toISOString();

    saveDepositRecord({
      id,
      userId: String(userId),
      userName: userName || '',
      userEmail: userEmail || '',
      amount: Number(amount),
      network,
      txHash: txHash.trim(),
      status: 'pending',
      date: depositDate,
    });
    saveTransactionRecord({
      id: `tx_${id}`,
      userId: String(userId),
      type: 'deposit',
      amount: Number(amount),
      network,
      status: 'pending',
      date: depositDate,
      hash: txHash.trim(),
    });

    pushNotification(
      String(userId),
      'Deposit Submitted',
      `Your deposit of ${Number(amount).toFixed(2)} USDT (${network}) was submitted. We are verifying your payment.`,
      'info'
    );
    invalidateCache('deposits:');
    invalidateCache('transactions:');
    triggerAutoVerify();

    return NextResponse.json({ success: true, id, status: 'pending' });
  } catch (error) {
    console.error('API deposits error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');
  const status = searchParams.get('status');
  let cacheKey = 'deposits:all:all';
  let targetUserId: string | null = null;

  try {
    const auth = getAuth(request);
    if (!auth) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    targetUserId = !auth.isAdmin ? String(auth.id) : userId ? String(userId) : null;
    cacheKey = `deposits:${targetUserId || 'all'}:${status || 'all'}`;

    const cached = getCached<any[]>(cacheKey, 8000);
    if (cached) {
      return NextResponse.json(cached);
    }

    const adminDb = getAdminDb();
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

    setCached(cacheKey, deposits);
    return NextResponse.json(deposits);
  } catch (error) {
    console.error('API deposits GET error, returning persistent cache:', error);
    const fallbackList = getDepositsList(targetUserId, status);
    return NextResponse.json(fallbackList);
  }
}