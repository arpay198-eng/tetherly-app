import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { getAuth } from '@/lib/auth';
import { pushNotification } from '@/lib/notifications';
import { verifyPassword } from '@/lib/password';
import { checkRateLimit } from '@/lib/rateLimit';
import {
  getCached,
  setCached,
  getFallback,
  invalidateCache,
  getUserById,
  saveUserRecord,
  getWithdrawalsList,
  saveWithdrawalRecord,
  saveTransactionRecord,
  withTimeout,
} from '@/lib/apiCache';

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
      let currentWd: any = getWithdrawalsList().find((w) => String(w.id) === String(clientId));
      if (!currentWd) {
        try {
          const snapshot = await withTimeout(wdRef.get(), 1500);
          if (snapshot.exists) currentWd = snapshot.data();
        } catch (e: any) {
          console.warn('Firestore wdRef.get error (falling back to cache):', e?.message);
        }
      }
      if (!currentWd) {
        return NextResponse.json({ error: 'Withdrawal request not found' }, { status: 404 });
      }

      const targetUserId = String(currentWd.userId || body.userId);
      const userRef = adminDb.collection('users').doc(targetUserId);
      const wdAmount = Number(currentWd.amount || body.amount);
      const wdWalletType = currentWd.walletType || 'deposit';
      const currentStatus = currentWd.status;

      // A rejected withdrawal refunds the deducted amount back to the user.
      if (status === 'rejected' && currentStatus !== 'rejected') {
        const rejectReason = body.rejectReason || 'Address or KYC verification failed';
        try {
          await withTimeout(adminDb.runTransaction(async (tx) => {
            const userSnap = await tx.get(userRef);
            if (userSnap.exists) {
              const user = userSnap.data()!;
              const balance = Number(user.balance) || 0;
              const depositBalance = user.depositBalance !== undefined ? Number(user.depositBalance) : balance;
              const bonusBalance = Number(user.bonusBalance) || 0;
              
              // Refund to the correct wallet
              const updates: Record<string, any> = {};
              if (wdWalletType === 'deposit') {
                updates.balance = balance + wdAmount;
                updates.depositBalance = depositBalance + wdAmount;
              } else {
                updates.bonusBalance = bonusBalance + wdAmount;
              }
              tx.update(userRef, updates);
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
          }), 2000);
        } catch (txErr: any) {
          console.warn('Admin reject transaction failed (using fast direct write fallback):', txErr?.message);
          const cachedUser = getUserById(targetUserId) || {};
          const currentBal = Number(cachedUser.balance) || 0;
          const currentDepBal = cachedUser.depositBalance !== undefined ? Number(cachedUser.depositBalance) : currentBal;
          const currentBonusBal = Number(cachedUser.bonusBalance) || 0;
          
          // Refund to the correct wallet
          const refundUpdates: Record<string, any> = {};
          if (wdWalletType === 'deposit') {
            refundUpdates.balance = currentBal + wdAmount;
            refundUpdates.depositBalance = currentDepBal + wdAmount;
          } else {
            refundUpdates.bonusBalance = currentBonusBal + wdAmount;
          }

          userRef.set(refundUpdates, { merge: true }).catch(() => {});
          wdRef.set({
            status: 'rejected',
            rejectReason,
            reviewedAt: body.reviewedAt || new Date().toISOString(),
          }, { merge: true }).catch(() => {});
          adminDb.collection('transactions').doc(`tx_${clientId}`).set({
            status: 'failed',
            rejectReason,
          }, { merge: true }).catch(() => {});

          saveUserRecord({
            id: targetUserId,
            ...refundUpdates,
          });
        }

        const cachedUser = getUserById(targetUserId) || {};
        const curBal = Number(cachedUser.balance) || 0;
        const curDep = cachedUser.depositBalance !== undefined ? Number(cachedUser.depositBalance) : curBal;
        const curBonus = Number(cachedUser.bonusBalance) || 0;
        
        // Refund to the correct wallet
        const finalRefundUpdates: Record<string, any> = {};
        if (wdWalletType === 'deposit') {
          finalRefundUpdates.balance = curBal + wdAmount;
          finalRefundUpdates.depositBalance = curDep + wdAmount;
        } else {
          finalRefundUpdates.bonusBalance = curBonus + wdAmount;
        }
        
        saveUserRecord({
          id: targetUserId,
          ...finalRefundUpdates,
        });

        saveWithdrawalRecord({
          ...currentWd,
          status: 'rejected',
          rejectReason,
          reviewedAt: new Date().toISOString(),
        });
        saveTransactionRecord({
          id: `tx_${clientId}`,
          userId: targetUserId,
          type: 'withdrawal',
          amount: -wdAmount,
          status: 'failed',
          rejectReason,
        });

        pushNotification(
          targetUserId,
          'Withdrawal Rejected',
          `Your withdrawal of ${wdAmount} USDT from ${wdWalletType === 'deposit' ? 'Deposit' : 'Bonus'} Wallet was rejected: ${rejectReason}. Funds have been refunded to your ${wdWalletType === 'deposit' ? 'Deposit' : 'Bonus'} Wallet.`,
          'warning'
        );

        invalidateCache('withdrawals:');
        invalidateCache('users:');
        invalidateCache('transactions:');
        return NextResponse.json({ success: true, id: clientId, status: 'rejected' });
      }

      // status === 'completed' or 'processing'
      const txHashToUse = body.txHash || (status === 'completed' ? `0x_wd_${Date.now()}` : undefined);
      const updateData: Record<string, unknown> = {
        status,
        reviewedAt: body.reviewedAt || new Date().toISOString(),
      };
      if (txHashToUse) updateData.txHash = txHashToUse;

      wdRef.set(updateData, { merge: true }).catch((err: any) => {
        console.warn('wdRef.set error:', err?.message);
      });

      const txDocRef = adminDb.collection('transactions').doc(`tx_${clientId}`);
      txDocRef.set({
        id: `tx_${clientId}`,
        userId: targetUserId,
        type: 'withdrawal',
        amount: -wdAmount,
        network: currentWd.network || 'BEP20',
        status: status === 'completed' ? 'completed' : 'pending',
        date: currentWd.date || new Date().toISOString(),
        ...(txHashToUse ? { hash: txHashToUse } : {}),
      }, { merge: true }).catch((err: any) => {
        console.warn('txDocRef.set error:', err?.message);
      });

      saveWithdrawalRecord({
        ...currentWd,
        ...updateData,
      });
      saveTransactionRecord({
        id: `tx_${clientId}`,
        userId: targetUserId,
        type: 'withdrawal',
        amount: -wdAmount,
        network: currentWd.network || 'BEP20',
        status: status === 'completed' ? 'completed' : 'pending',
        date: currentWd.date || new Date().toISOString(),
        ...(txHashToUse ? { hash: txHashToUse } : {}),
      });

      if (status === 'completed') {
        const msg = body.txHash 
          ? `Your withdrawal of ${wdAmount.toFixed(2)} USDT has been approved and sent. TxID: ${body.txHash}`
          : `Your withdrawal of ${wdAmount.toFixed(2)} USDT has been approved and sent.`;
        pushNotification(
          targetUserId,
          'Withdrawal Approved',
          msg,
          'success'
        );
      }

      invalidateCache('withdrawals:');
      invalidateCache('users:');
      invalidateCache('transactions:');
      return NextResponse.json({ success: true, id: clientId, status });
    }

    // New pending withdrawal submission:
    const { userName, userEmail, date } = body;
    const amount = Number(body.amount);
    const address = String(body.address || '').trim();
    const network = body.network || 'BEP20';
    const walletType = body.walletType || 'deposit';
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
    let userRecord: any = null;
    {
      const confirmPassword = String(body?.confirmPassword || '');
      if (!confirmPassword) {
        return NextResponse.json({ error: 'Please enter your login password to confirm the withdrawal' }, { status: 400 });
      }

      // Fast-path: check snapshot cache first to avoid slow Firestore timeouts
      userRecord = getUserById(String(userId));
      if (!userRecord) {
        try {
          const uSnap = await withTimeout(adminDb.collection('users').doc(String(userId)).get(), 1500);
          if (uSnap.exists) userRecord = uSnap.data();
        } catch (err: any) {
          console.warn('Firestore user lookup error (falling back to cache):', err?.message);
        }
      }

      if (!userRecord || !(await verifyPassword(confirmPassword, userRecord.password || ''))) {
        return NextResponse.json({ error: 'Invalid login password. Please try again.' }, { status: 401 });
      }
    }

    const userBalance = Number(userRecord.balance) || 0;
    const userDepositBalance = userRecord.depositBalance !== undefined ? Number(userRecord.depositBalance) : userBalance;
    const userBonusBalance = Number(userRecord.bonusBalance) || 0;
    const userLastDepositDate = userRecord.lastDepositDate || null;
    const userLastDepositAmount = Number(userRecord.lastDepositAmount) || 0;

    if (userRecord.status === 'blocked') {
      return NextResponse.json({ error: 'Your account has been suspended by admin. Withdrawals blocked.' }, { status: 403 });
    }

    // Check balance from selected wallet
    const selectedBalance = walletType === 'deposit' ? userDepositBalance : userBonusBalance;
    if (selectedBalance < amount) {
      return NextResponse.json({ error: `Insufficient balance. Available: ${selectedBalance} USDT in ${walletType === 'deposit' ? 'Deposit' : 'Bonus'} Wallet` }, { status: 400 });
    }

    // 24h deposit lock applies to deposit wallet withdrawals; bonus wallet is always available
    if (walletType === 'deposit' && !auth.isAdmin && userLastDepositDate && userLastDepositAmount > 0) {
      const lockedUntil = new Date(userLastDepositDate).getTime() + LOCK_MS;
      if (Date.now() < lockedUntil) {
        const remainingSec = Math.ceil((lockedUntil - Date.now()) / 1000);
        const remH = Math.floor(remainingSec / 3600);
        const remM = Math.floor((remainingSec % 3600) / 60);
        const remS = remainingSec % 60;
        return NextResponse.json({
          error: `Deposit is locked for 24 hours. Withdrawals unlock in ${String(remH).padStart(2, '0')}:${String(remM).padStart(2, '0')}:${String(remS).padStart(2, '0')}`
        }, { status: 400 });
      }
    }

    // Server-generated ID for new withdrawals.
    const wdRef = adminDb.collection('withdrawals').doc();
    const id = wdRef.id;
    const userRef = adminDb.collection('users').doc(String(userId));

    const wdData = {
      id,
      userId: String(userId),
      userName: userName || userRecord.name || '',
      userEmail: userEmail || userRecord.email || '',
      amount,
      address,
      network,
      walletType, // Track which wallet the withdrawal came from
      status: 'pending',
      date: date || new Date().toISOString(),
    };

    let result: any = null;
    try {
      result = await withTimeout(adminDb.runTransaction(async (tx) => {
        const userSnap = await tx.get(userRef);
        if (!userSnap.exists) {
          throw new Error('Account not found');
        }
        const user = userSnap.data()!;
        const balance = Number(user.balance) || 0;
        const depositBalance = user.depositBalance !== undefined ? Number(user.depositBalance) : balance;
        const bonusBalance = Number(user.bonusBalance) || 0;
        
        // Check balance from selected wallet
        const txSelectedBalance = walletType === 'deposit' ? depositBalance : bonusBalance;
        if (txSelectedBalance < amount) {
          throw new Error(`Insufficient balance in ${walletType === 'deposit' ? 'Deposit' : 'Bonus'} Wallet`);
        }

        // Deduct from the correct wallet
        let newDepositBalance = depositBalance;
        let newBonusBalance = bonusBalance;
        let newBalance = balance;
        const updates: Record<string, any> = {};
        
        if (walletType === 'deposit') {
          newDepositBalance = Math.max(0, depositBalance - amount);
          newBalance = Math.max(0, balance - amount);
          updates.lastDepositDate = new Date().toISOString();
          // Full deposit withdrawal resets pending claims cycle
          if (newDepositBalance <= 0) {
            updates.pendingClaims = 0;
            updates.lastBonusGeneratedAt = null;
          }
        } else {
          newBonusBalance = Math.max(0, bonusBalance - amount);
        }

        updates.balance = newBalance;
        updates.depositBalance = newDepositBalance;
        updates.bonusBalance = newBonusBalance;
        updates.lastWithdrawalDate = new Date().toISOString();

        tx.set(wdRef, wdData);
        tx.update(userRef, updates);

        // Atomically write the pending transaction record on the server
        const txDocRef = adminDb.collection('transactions').doc(`tx_${id}`);
        tx.set(txDocRef, {
          id: `tx_${id}`,
          userId: String(userId),
          type: 'withdrawal',
          amount: -Number(amount),
          network,
          walletType,
          status: 'pending',
          date: wdData.date,
          hash: id,
        });

        return {
          balance: newBalance,
          depositBalance: newDepositBalance,
          bonusBalance: newBonusBalance,
          bonusClaimed: !!user.bonusClaimed,
          lastDepositDate: new Date().toISOString(),
          lastDepositAmount: Number(user.lastDepositAmount) || 0,
          pendingClaims: newDepositBalance <= 0 ? 0 : (Number(user.pendingClaims) || 0),
          lastBonusGeneratedAt: newDepositBalance <= 0 ? null : user.lastBonusGeneratedAt,
        };
      }), 10000); // 10s timeout for transaction
    } catch (txErr: any) {
      console.error('Firestore runTransaction failed for withdrawal:', txErr?.message);
      if (txErr?.message?.includes('Insufficient balance')) {
        return NextResponse.json({ error: txErr.message }, { status: 400 });
      }
      // NEVER use non-atomic fallback for withdrawals — prevents double-spend race condition
      return NextResponse.json({ error: 'Withdrawal processing failed. Please try again.' }, { status: 500 });
    }

    saveWithdrawalRecord(wdData);
    saveTransactionRecord({
      id: `tx_${id}`,
      userId: String(userId),
      type: 'withdrawal',
      amount: -Number(amount),
      network,
      status: 'pending',
      date: wdData.date,
      hash: id,
    });
    saveUserRecord({
      id: String(userId),
      balance: result.balance,
      depositBalance: result.depositBalance,
      bonusBalance: result.bonusBalance,
      pendingClaims: result.pendingClaims,
      lastBonusGeneratedAt: result.lastBonusGeneratedAt,
    });

    pushNotification(
      String(userId),
      'Withdrawal Submitted',
      `Your withdrawal of ${amount} USDT from ${walletType === 'deposit' ? 'Deposit' : 'Bonus'} Wallet (${network}) was submitted and is pending admin review.`,
      'info'
    );
    invalidateCache('withdrawals:');
    invalidateCache('users:');
    invalidateCache('transactions:');
    return NextResponse.json({ success: true, id, user: result });
  } catch (error: any) {
    console.error('API withdrawals error:', error);
    return NextResponse.json({ error: error?.message || 'Withdrawal failed' }, { status: 400 });
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');
  const status = searchParams.get('status');
  let cacheKey = 'withdrawals:all:all';
  let targetUserId: string | null = null;

  try {
    const auth = getAuth(request);
    if (!auth) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    targetUserId = !auth.isAdmin ? String(auth.id) : userId ? String(userId) : null;
    cacheKey = `withdrawals:${targetUserId || 'all'}:${status || 'all'}`;

    const cached = getCached<any[]>(cacheKey, 8000);
    if (cached) {
      return NextResponse.json(cached);
    }

    const adminDb = getAdminDb();
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

    setCached(cacheKey, withdrawals);
    return NextResponse.json(withdrawals);
  } catch (error) {
    console.error('API withdrawals GET error, returning persistent cache:', error);
    const fallbackList = getWithdrawalsList(targetUserId, status);
    return NextResponse.json(fallbackList);
  }
}