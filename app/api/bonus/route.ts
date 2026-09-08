import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { getAuth } from '@/lib/auth';
import { pushNotification } from '@/lib/notifications';

export const dynamic = 'force-dynamic';

const BONUS_RATE = 0.04;
const LOCK_MS = 24 * 60 * 60 * 1000;

export async function POST(request: Request) {
  try {
    const auth = getAuth(request);
    if (!auth) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const adminDb = getAdminDb();
    const userRef = adminDb.collection('users').doc(auth.id);

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
      const bonusClaimed = !!user.bonusClaimed;

      if (!lastDepositDate || lastDepositAmount <= 0) {
        throw new Error('No active deposit to claim a bonus on');
      }
      if (depositBalance <= 0) {
        throw new Error('Deposit balance is empty');
      }
      if (bonusClaimed) {
        throw new Error('Bonus already claimed in this cycle');
      }
      if (Date.now() < new Date(lastDepositDate).getTime() + LOCK_MS) {
        throw new Error('Bonus unlocks 24 hours after the latest deposit');
      }

      const bonus = Math.round(depositBalance * BONUS_RATE * 100) / 100;
      const newBalance = balance + bonus;
      const newBonusBalance = (Number(user.bonusBalance) || 0) + bonus;

      tx.update(userRef, {
        balance: newBalance,
        bonusBalance: newBonusBalance,
        bonusClaimed: true,
        bonusClaimedAt: new Date().toISOString(),
      });

      return {
        bonus,
        balance: newBalance,
        bonusBalance: newBonusBalance,
        depositBalance,
        bonusClaimed: true,
        lastDepositDate,
        lastDepositAmount,
      };
    });

    pushNotification(
      String(auth.id),
      'Bonus Claimed',
      `Your bonus of ${result.bonus.toFixed(2)} USDT has been credited to your balance.`,
      'success'
    );
    return NextResponse.json({ success: true, ...result });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Bonus claim failed' }, { status: 400 });
  }
}

export async function GET(request: Request) {
  return NextResponse.json({ method: 'POST', error: 'Use POST to claim your bonus' });
}