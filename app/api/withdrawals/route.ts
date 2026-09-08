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
    const { userId, userName, userEmail, amount, address, network, status, date } = body;
    // Admin transitions send the existing withdrawal ID; new pending don't.
    const clientId = body.id;

    if (!userId || !amount || !address || !network || !status) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (typeof amount !== 'number' || amount <= 0) {
      return NextResponse.json({ error: 'Amount must be a positive number' }, { status: 400 });
    }

    if (network !== 'BEP20') {
      return NextResponse.json({ error: 'Only BEP20 network is supported' }, { status: 400 });
    }

    if (status !== 'pending' && status !== 'processing' && status !== 'completed' && status !== 'rejected') {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    if (!address || address.trim().length === 0) {
      return NextResponse.json({ error: 'Wallet address is required' }, { status: 400 });
    }

    const adminDb = getAdminDb();

    if (status === 'pending') {
      // User submits a new withdrawal: server validates balance/lock and deducts atomically.
      if (!auth.isAdmin && userId !== auth.id) {
        return NextResponse.json({ error: 'You can only submit withdrawals for your own account' }, { status: 403 });
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
            userId,
            userName: userName || '',
            userEmail: userEmail || '',
            amount,
            address: address.trim(),
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
    }

    // Admin transitions (processing / completed / rejected)
    if (!auth.isAdmin) {
      return NextResponse.json({ error: 'Only admins can change withdrawal status' }, { status: 403 });
    }

    if (!clientId) {
      return NextResponse.json({ error: 'Withdrawal id is required for admin transitions' }, { status: 400 });
    }

    const wdRef = adminDb.collection('withdrawals').doc(String(clientId));
    const userRef = adminDb.collection('users').doc(String(userId));

    const snapshot = await wdRef.get();
    if (!snapshot.exists) {
      return NextResponse.json({ error: 'Withdrawal request not found' }, { status: 404 });
    }
    const currentStatus = snapshot.data()?.status;

    // A rejected withdrawal refunds the deducted amount back to the user.
    if (status === 'rejected' && currentStatus !== 'rejected') {
      await adminDb.runTransaction(async (tx) => {
        const userSnap = await tx.get(userRef);
        if (userSnap.exists) {
          const user = userSnap.data()!;
          const balance = Number(user.balance) || 0;
          const depositBalance = user.depositBalance !== undefined ? Number(user.depositBalance) : balance;
          tx.update(userRef, {
            balance: balance + amount,
            depositBalance: depositBalance + amount,
          });
        }
        tx.update(wdRef, {
          status: 'rejected',
          rejectReason: body.rejectReason || 'Address or KYC verification failed',
          reviewedAt: body.reviewedAt || new Date().toISOString(),
        });
      });
      pushNotification(
        String(userId),
        'Withdrawal Rejected',
        `Your withdrawal of ${Number(amount).toFixed(2)} USDT was rejected and the amount has been refunded to your balance.`,
        'warning'
      );
    } else {
      await wdRef.set({
        id: clientId,
        userId,
        userName: userName || '',
        userEmail: userEmail || '',
        amount,
        address: address.trim(),
        network,
        status,
        date: date || new Date().toISOString(),
      }, { merge: true });
      if (status === 'completed') {
        pushNotification(
          String(userId),
          'Withdrawal Approved',
          `Your withdrawal of ${Number(amount).toFixed(2)} USDT has been approved and sent.`,
          'success'
        );
      }
    }

    return NextResponse.json({ success: true, id: clientId });
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
    const q = adminDb.collection('withdrawals').orderBy('date', 'desc').limit(100);
    const snap = await q.get();
    const withdrawals: any[] = [];
    snap.forEach((docSnap) => {
      const data = docSnap.data();
      // Non-admin users can only see their own withdrawals.
      if (!auth.isAdmin && String(data.userId) !== String(auth.id)) return;
      if (userId && data.userId !== userId) return;
      if (status && data.status !== status) return;
      withdrawals.push(data);
    });
    return NextResponse.json(withdrawals);
  } catch (error) {
    console.error('API withdrawals GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}