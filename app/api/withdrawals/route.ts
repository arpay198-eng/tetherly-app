import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { getAuth } from '@/lib/auth';
import { pushNotification } from '@/lib/notifications';
import { verifyPassword } from '@/lib/password';
import { checkRateLimit } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

const LOCK_MS = 24 * 60 * 60 * 1000;

export async function POST(request: Request) {
  try {
    const auth = getAuth(request);
    if (!auth) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    // Rate limit: 5 withdrawal attempts per minute per user.
    const rl = checkRateLimit(`withdrawals:${auth.id}`, 5, 60_000);
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

    // Admin transitions (processing / completed / rejected)
    if (status === 'processing' || status === 'completed' || status === 'rejected') {
      if (!auth.isAdmin) {
        return NextResponse.json({ error: 'Only admins can change withdrawal status' }, { status: 403 });
      }
      if (!clientId) {
        return NextResponse.json({ error: 'Withdrawal id is required for admin transitions' }, { status: 400 });
      }

      const wdRef = adminDb.collection('withdrawals').doc(String(clientId));
      const snapshot = await wdRef.get();
      if (!snapshot.exists) {
        return NextResponse.json({ error: 'Withdrawal request not found' }, { status: 404 });
      }
      const currentWd = snapshot.data()!;
      const targetUserId = String(currentWd.userId || body.userId);
      const userRef = adminDb.collection('users').doc(targetUserId);
      const wdAmount = Number(currentWd.amount || body.amount);
      const currentStatus = currentWd.status;

      // A rejected withdrawal refunds the deducted amount back to the user.
      if (status === 'rejected' && currentStatus !== 'rejected') {
        const rejectReason = body.rejectReason || 'Address or KYC verification failed';
        await adminDb.runTransaction(async (tx) => {
          const userSnap = await tx.get(userRef);
          if (userSnap.exists) {
            const user = userSnap.data()!;
            const balance = Number(user.balance) || 0;
            const depositBalance = user.depositBalance !== undefined ? Number(user.depositBalance) : balance;
            tx.update(userRef, {
              balance: balance + wdAmount,
              depositBalance: depositBalance + wdAmount,
            });
          }
          tx.update(wdRef, {
            status: 'rejected',
            rejectReason,
            reviewedAt: body.reviewedAt || new Date().toISOString(),
          });
          const txDocRef = adminDb.collection('transactions').doc(`tx_${clientId}`);
          const txSnap = await tx.get(txDocRef);
          if (txSnap.exists) {
            tx.update(txDocRef, {
              status: 'failed',
              rejectReason,
            });
          }
        });

        // Update any duplicate transactions created by legacy client sync
        const extraTx = await adminDb.collection('transactions').where('hash', '==', String(clientId)).get();
        if (!extraTx.empty) {
          const batch = adminDb.batch();
          extraTx.forEach((doc) => batch.update(doc.ref, { status: 'failed', rejectReason }));
          await batch.commit();
        }

        pushNotification(
          targetUserId,
          'Withdrawal Rejected',
          `Your withdrawal of ${wdAmount.toFixed(2)} USDT was rejected: ${rejectReason}. Funds have been refunded to your balance.`,
          'warning'
        );

        return NextResponse.json({ success: true, id: clientId, status: 'rejected' });
      }

      // status === 'completed' or 'processing'
      const txHashToUse = body.txHash || (status === 'completed' ? `0x_wd_${Date.now()}` : undefined);
      const updateData: Record<string, unknown> = {
        status,
        reviewedAt: body.reviewedAt || new Date().toISOString(),
      };
      if (txHashToUse) updateData.txHash = txHashToUse;
      await wdRef.update(updateData);

      const txDocRef = adminDb.collection('transactions').doc(`tx_${clientId}`);
      const txSnap = await txDocRef.get();
      if (txSnap.exists) {
        await txDocRef.update({
          status: status === 'completed' ? 'completed' : 'pending',
          ...(txHashToUse ? { hash: txHashToUse } : {}),
        });
      } else {
        await txDocRef.set({
          id: `tx_${clientId}`,
          userId: targetUserId,
          type: 'withdrawal',
          amount: -wdAmount,
          network: currentWd.network || 'BEP20',
          status: status === 'completed' ? 'completed' : 'pending',
          date: currentWd.date || new Date().toISOString(),
          ...(txHashToUse ? { hash: txHashToUse } : {}),
        });
      }

      if (status === 'completed') {
        const extraTx = await adminDb.collection('transactions').where('hash', '==', String(clientId)).get();
        if (!extraTx.empty) {
          const batch = adminDb.batch();
          extraTx.forEach((doc) => batch.update(doc.ref, { status: 'completed', hash: txHashToUse }));
          await batch.commit();
        }

        pushNotification(
          targetUserId,
          'Withdrawal Approved',
          `Your withdrawal of ${wdAmount.toFixed(2)} USDT has been approved and sent.`,
          'success'
        );
      }

      return NextResponse.json({ success: true, id: clientId, status });
    }

    // New pending withdrawal submission:
    const { userName, userEmail, date } = body;
    const amount = Number(body.amount);
    const address = String(body.address || '').trim();
    const network = body.network || 'BEP20';
    const userId = String(auth.isAdmin ? (body.userId || auth.id) : auth.id);

    if (!amount || amount <= 0) {
      return NextResponse.json({ error: 'Amount must be a positive number' }, { status: 400 });
    }

    if (network !== 'BEP20') {
      return NextResponse.json({ error: 'Only BEP20 network is supported' }, { status: 400 });
    }

    if (!address) {
      return NextResponse.json({ error: 'Wallet address is required' }, { status: 400 });
    }

    // Withdrawals are money going OUT: require login-password re-verification for
    // EVERYONE (including the admin), so a stolen session token alone cannot drain
    // an account. Verified server-side.
    {
      const confirmPassword = String(body?.confirmPassword || '');
      if (!confirmPassword) {
        return NextResponse.json({ error: 'Please enter your login password to confirm the withdrawal' }, { status: 400 });
      }
      const uSnap = await adminDb.collection('users').doc(String(userId)).get();
      const userRecord = uSnap.exists ? uSnap.data() : null;
      if (!userRecord || !(await verifyPassword(confirmPassword, userRecord.password || ''))) {
        return NextResponse.json({ error: 'Invalid password. Please try again.' }, { status: 401 });
      }
    }

    // Server-generated ID for new withdrawals.
    const wdRef = adminDb.collection('withdrawals').doc();
    const id = wdRef.id;
    const userRef = adminDb.collection('users').doc(String(userId));

    try {
      const result = await adminDb.runTransaction(async (tx) => {
        const userSnap = await tx.get(userRef);
        if (!userSnap.exists) {
          throw new Error('Account not found');
        }
        const user = userSnap.data()!;
        const balance = Number(user.balance) || 0;
        const depositBalance = user.depositBalance !== undefined ? Number(user.depositBalance) : balance;
        const lastDepositDate = user.lastDepositDate || null;
        const lastDepositAmount = Number(user.lastDepositAmount) || 0;

        if (user.status === 'blocked') {
          throw new Error('Your account has been suspended');
        }
        if (balance < amount) {
          throw new Error('Insufficient balance');
        }
        // 24h deposit lock applies to normal users; the admin is exempt (operator).
        if (!auth.isAdmin && lastDepositDate && lastDepositAmount > 0) {
          const lockedUntil = new Date(lastDepositDate).getTime() + LOCK_MS;
          if (Date.now() < lockedUntil) {
            throw new Error('Deposit is locked for 24 hours. Withdrawal will unlock after the countdown');
          }
        }

        const newBalance = balance - amount;
        const newDepositBalance = Math.max(0, depositBalance - amount);

        const wdData = {
          id,
          userId: String(userId),
          userName: userName || '',
          userEmail: userEmail || '',
          amount,
          address,
          network,
          status: 'pending',
          date: date || new Date().toISOString(),
        };
        tx.set(wdRef, wdData);
        tx.update(userRef, {
          balance: newBalance,
          depositBalance: newDepositBalance,
          lastWithdrawalDate: new Date().toISOString(),
        });

        // Atomically write the pending transaction record on the server
        const txDocRef = adminDb.collection('transactions').doc(`tx_${id}`);
        tx.set(txDocRef, {
          id: `tx_${id}`,
          userId: String(userId),
          type: 'withdrawal',
          amount: -Number(amount),
          network,
          status: 'pending',
          date: wdData.date,
          hash: id,
        });

        return {
          balance: newBalance,
          depositBalance: newDepositBalance,
          bonusBalance: Number(user.bonusBalance) || 0,
          bonusClaimed: !!user.bonusClaimed,
          lastDepositDate: user.lastDepositDate || null,
          lastDepositAmount: Number(user.lastDepositAmount) || 0,
        };
      });

      pushNotification(
        String(userId),
        'Withdrawal Submitted',
        `Your withdrawal of ${Number(amount).toFixed(2)} USDT (${network}) was submitted and is pending admin review.`,
        'info'
      );
      return NextResponse.json({ success: true, id, user: result });
    } catch (err: any) {
      return NextResponse.json({ error: err?.message || 'Withdrawal failed' }, { status: 400 });
    }
  } catch (error) {
    console.error('API withdrawals error:', error);
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
    const withdrawals: any[] = [];

    if (targetUserId) {
      const snap = await adminDb.collection('withdrawals').where('userId', '==', targetUserId).get();
      snap.forEach((docSnap) => {
        const data = docSnap.data();
        if (status && data.status !== status) return;
        withdrawals.push(data);
      });
      withdrawals.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
    } else {
      const q = adminDb.collection('withdrawals').orderBy('date', 'desc').limit(200);
      const snap = await q.get();
      snap.forEach((docSnap) => {
        const data = docSnap.data();
        if (status && data.status !== status) return;
        withdrawals.push(data);
      });
    }
    return NextResponse.json(withdrawals);
  } catch (error) {
    console.error('API withdrawals GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}