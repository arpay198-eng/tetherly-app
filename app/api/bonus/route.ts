import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { getAuth } from '@/lib/auth';
import { pushNotification } from '@/lib/notifications';
import { checkRateLimit } from '@/lib/rateLimit';
import {
  getUserById,
  saveUserRecord,
  withTimeout,
} from '@/lib/apiCache';

const BONUS_RATE = 0.04;
const LOCK_MS = 24 * 60 * 60 * 1000;

export async function POST(request: Request) {
  try {
    const auth = getAuth(request);
    if (!auth) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const rl = checkRateLimit(`bonus:${auth.id}`, 5, 60_000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: `Too many requests. Try again in ${Math.ceil(rl.retryAfterMs / 1000)}s.` },
        { status: 429 },
      );
    }

    const adminDb = getAdminDb();
    const userRef = adminDb.collection('users').doc(String(auth.id));

    let userRecord = getUserById(String(auth.id));
    if (!userRecord) {
      try {
        const snap = await withTimeout(userRef.get(), 1500);
        if (snap.exists) userRecord = snap.data();
      } catch (err: any) {
        console.warn('Firestore userRef.get error:', err?.message);
      }
    }
    if (!userRecord) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    const depositBalance = userRecord.depositBalance !== undefined ? Number(userRecord.depositBalance) : 0;
    const lastDepositDate = userRecord.lastDepositDate || null;
    const lastDepositAmount = Number(userRecord.lastDepositAmount) || 0;
    let pendingClaims = Number(userRecord.pendingClaims) || 0;
    const lastBonusGeneratedAt = userRecord.lastBonusGeneratedAt || null;

    if (!lastDepositDate || lastDepositAmount <= 0) {
      return NextResponse.json({ error: 'No active deposit to claim a bonus on' }, { status: 400 });
    }
    if (depositBalance <= 0) {
      return NextResponse.json({ error: 'Deposit balance is empty' }, { status: 400 });
    }

    // If pendingClaims is 0 but time has elapsed, calculate fresh claims (same logic as GET)
    if (pendingClaims <= 0) {
      const now = Date.now();
      const claimStartAt = lastBonusGeneratedAt
        ? new Date(lastBonusGeneratedAt).getTime() + LOCK_MS
        : new Date(lastDepositDate).getTime() + LOCK_MS;
      if (now >= claimStartAt) {
        const elapsed = now - claimStartAt;
        const newClaims = Math.floor(elapsed / LOCK_MS) + 1;
        pendingClaims = newClaims;
        // Pre-update Firestore so transaction sees it
        try {
          await userRef.update({ pendingClaims });
        } catch (e: any) {
          console.warn('Pre-update pendingClaims failed:', e?.message);
        }
      }
    }

    if (pendingClaims <= 0) {
      return NextResponse.json({ error: 'No pending claims available' }, { status: 400 });
    }


    let result: any = null;
    try {
      result = await withTimeout(adminDb.runTransaction(async (tx) => {
        const userSnap = await tx.get(userRef);
        if (!userSnap.exists) throw new Error('Account not found');
        const user = userSnap.data()!;

        const txBal = Number(user.balance) || 0;
        const txDepBal = user.depositBalance !== undefined ? Number(user.depositBalance) : txBal;
        const txPendingClaims = Number(user.pendingClaims) || 0;

        if (txPendingClaims <= 0) throw new Error('No pending claims available');
        if (txDepBal <= 0) throw new Error('Deposit balance is empty');

        const txTotalBonus = Math.round(txDepBal * BONUS_RATE * txPendingClaims * 100) / 100;
        const txNewBonusBal = (Number(user.bonusBalance) || 0) + txTotalBonus;

        const now = new Date().toISOString();

        tx.update(userRef, {
          balance: txBal,
          bonusBalance: txNewBonusBal,
          pendingClaims: 0,
          bonusClaimedAt: now,
          lastBonusGeneratedAt: now,
        });

        return {
          bonus: txTotalBonus,
          pendingClaims: txPendingClaims,
          balance: txBal,
          bonusBalance: txNewBonusBal,
          depositBalance: txDepBal,
        };
      }), 10000);
    } catch (txErr: any) {
      console.error('Firestore runTransaction failed for bonus claim:', txErr?.message);
      return NextResponse.json({ error: 'Bonus claim failed. Please try again.' }, { status: 500 });
    }

    saveUserRecord({
      id: String(auth.id),
      balance: result.balance,
      bonusBalance: result.bonusBalance,
      pendingClaims: 0,
      bonusClaimedAt: new Date().toISOString(),
      lastBonusGeneratedAt: new Date().toISOString(),
    });

    pushNotification(
      String(auth.id),
      'Bonus Claimed',
      `Your bonus of ${result.bonus} USDT (${result.pendingClaims} claims) has been credited to your Bonus Wallet.`,
      'success'
    );
    return NextResponse.json({ success: true, ...result });
  } catch (err: any) {
    console.error('API bonus error:', err);
    return NextResponse.json({ error: err?.message || 'Bonus claim failed' }, { status: 400 });
  }
}

export async function GET(request: Request) {
  try {
    const auth = getAuth(request);
    if (!auth) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const adminDb = getAdminDb();
    const userRef = adminDb.collection('users').doc(String(auth.id));

    let userRecord = getUserById(String(auth.id));
    if (!userRecord) {
      try {
        const snap = await withTimeout(userRef.get(), 1500);
        if (snap.exists) userRecord = snap.data();
      } catch (err: any) {
        console.warn('Firestore userRef.get error:', err?.message);
      }
    }
    if (!userRecord) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    const depositBalance = userRecord.depositBalance !== undefined ? Number(userRecord.depositBalance) : 0;
    const lastDepositDate = userRecord.lastDepositDate || null;
    const lastDepositAmount = Number(userRecord.lastDepositAmount) || 0;
    let pendingClaims = Number(userRecord.pendingClaims) || 0;
    const lastBonusGeneratedAt = userRecord.lastBonusGeneratedAt || null;

    if (!lastDepositDate || lastDepositAmount <= 0 || depositBalance <= 0) {
      return NextResponse.json({ pendingClaims: 0, nextClaimIn: 0, bonusPerClaim: 0, totalPending: 0 });
    }

    // Calculate elapsed time and generate new pending claims
    const now = Date.now();
    let claimStartAt: number;

    if (lastBonusGeneratedAt) {
      claimStartAt = new Date(lastBonusGeneratedAt).getTime() + LOCK_MS;
    } else {
      claimStartAt = new Date(lastDepositDate).getTime() + LOCK_MS;
    }

    if (now >= claimStartAt) {
      const elapsed = now - claimStartAt;
      // +1 because claimStartAt already marks the END of the first 24h period —
      // so reaching claimStartAt means 1 claim is ready, each additional LOCK_MS adds another.
      const newClaims = Math.floor(elapsed / LOCK_MS) + 1;
      const newGeneratedAt = new Date(claimStartAt + (newClaims - 1) * LOCK_MS).toISOString();

      pendingClaims += newClaims;

      // Update in Firestore
      try {
        await userRef.update({
          pendingClaims,
          lastBonusGeneratedAt: newGeneratedAt,
        });
        saveUserRecord({ ...userRecord, pendingClaims, lastBonusGeneratedAt: newGeneratedAt });
      } catch (e: any) {
        console.warn('Failed to update pendingClaims:', e?.message);
      }
    }

    const bonusPerClaim = Math.round(depositBalance * BONUS_RATE * 100) / 100;
    const totalPending = Math.round(bonusPerClaim * pendingClaims * 100) / 100;

    // Calculate next claim time — use the most current lastBonusGeneratedAt
    let nextClaimIn = 0;
    if (pendingClaims > 0) {
      nextClaimIn = 0; // Can claim now
    } else {
      // Time until next claim after current period
      const nextClaimAt = claimStartAt; // claimStartAt = lastBonusGeneratedAt + LOCK_MS
      nextClaimIn = Math.max(0, nextClaimAt - now);
    }

    return NextResponse.json({ pendingClaims, nextClaimIn, bonusPerClaim, totalPending });
  } catch (err: any) {
    console.error('API bonus GET error:', err);
    return NextResponse.json({ error: err?.message || 'Failed' }, { status: 400 });
  }
}
