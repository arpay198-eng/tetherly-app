import { getAdminDb } from './firebaseAdmin';
import { pushNotification } from './notifications';

/**
 * Daily referral bonus (up to level 2).
 *
 * Every day, for each user U that has a deposited balance:
 *  - Level 1: the user who referred U earns 0.75% of U's *current* balance.
 *  - Level 2: the user who referred U's referrer earns 0.25% of U's balance.
 *
 * Because the payout is always a percentage of the CURRENT balance, a user who
 * withdraws automatically shrinks (and eventually stops) the daily bonus. Nothing
 * is ever paid once the balance is (near) zero.
 *
 * Each funding user U is paid at most once per UTC calendar day
 * (`dailyBonusPaidOn` guard) so the job is idempotent across scheduler runs.
 */

const RATE_L1 = 0.0075;
const RATE_L2 = 0.0025;
const MIN_PAYOUT = 0.01;
const FARM_PAUSE_MS = 24 * 60 * 60 * 1000; // any withdrawal pauses the funder's bonus for 24h

interface BonusStats {
  processed: number;
  paidL1: number;
  paidL2: number;
  skipped: number;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export async function processDailyReferralBonuses(now: Date = new Date()): Promise<BonusStats> {
  const adminDb = getAdminDb();
  const today = now.toISOString().slice(0, 10);

  const usersSnap = await adminDb.collection('users').limit(1000).get();
  const users = new Map<string, { data: any; ref: any }>();
  usersSnap.forEach((d) => users.set(d.id, { data: d.data(), ref: d.ref }));

  const stats: BonusStats = { processed: 0, paidL1: 0, paidL2: 0, skipped: 0 };

  let batch = adminDb.batch();
  let ops = 0;

  const commitIfFull = async () => {
    if (ops >= 450) {
      await batch.commit();
      batch = adminDb.batch();
      ops = 0;
    }
  };

  for (const d of usersSnap.docs) {
    const u = users.get(d.id)!;
    const uid = d.id;
    const referredBy = u.data.referredBy ? String(u.data.referredBy) : null;
    const balance = Number(u.data.balance) || 0;

    // No invite chain or nothing deposited today → nothing to pay.
    if (!referredBy || balance <= MIN_PAYOUT) continue;
    if (u.data.dailyBonusPaidOn === today) {
      stats.skipped++;
      continue;
    }

    // Farming block: a recent withdrawal (within 24h) means the balance may have
    // been shuffled around → pause this funder's bonus for today.
    if (u.data.lastWithdrawalDate) {
      const lastWD = new Date(String(u.data.lastWithdrawalDate)).getTime();
      if (Number.isFinite(lastWD) && now.getTime() - lastWD < FARM_PAUSE_MS) {
        stats.skipped++;
        continue;
      }
    }

    const l1Entry = users.get(referredBy);
    if (!l1Entry) continue;
    const l1Id = referredBy;
    if (l1Id === uid) continue;

    // Level 1 (0.75% of the funder's balance).
    const amtL1 = round2(balance * RATE_L1);
    if (amtL1 >= MIN_PAYOUT) {
      const l1 = l1Entry.data;
      await batch.update(l1Entry.ref, {
        balance: round2((Number(l1.balance) || 0) + amtL1),
        bonusBalance: round2((Number(l1.bonusBalance) || 0) + amtL1),
        referralEarned: round2((Number(l1.referralEarned) || 0) + amtL1),
      });
      await batch.set(adminDb.collection('transactions').doc(`tx_rb_l1_${uid}_${today}`), {
        id: `tx_rb_l1_${uid}_${today}`,
        type: 'referral',
        bonusLevel: 1,
        amount: amtL1,
        network: 'USDT',
        status: 'completed',
        date: now.toISOString(),
        userId: l1Id,
        funderId: uid,
        note: `Level 1 daily bonus (0.75%) from ${u.data.name || uid}`,
      });
      pushNotification(
        l1Id,
        'Daily Bonus Earned',
        `You earned ${amtL1.toFixed(2)} USDT Level 1 daily bonus from ${u.data.name || uid}'s balance.`,
        'success'
      );
      ops += 2;
      stats.paidL1++;
    }

    // Level 2 (0.25% of the funder's balance, paid to the referrer's referrer).
    const l2Ref = l1Entry.data.referredBy ? String(l1Entry.data.referredBy) : null;
    if (l2Ref && l2Ref !== uid && l2Ref !== l1Id) {
      const l2Entry = users.get(l2Ref);
      if (l2Entry) {
        const amtL2 = round2(balance * RATE_L2);
        if (amtL2 >= MIN_PAYOUT) {
          const l2 = l2Entry.data;
          await batch.update(l2Entry.ref, {
            balance: round2((Number(l2.balance) || 0) + amtL2),
            bonusBalance: round2((Number(l2.bonusBalance) || 0) + amtL2),
            referralEarnedLevel2: round2((Number(l2.referralEarnedLevel2) || 0) + amtL2),
          });
          await batch.set(adminDb.collection('transactions').doc(`tx_rb_l2_${uid}_${today}`), {
            id: `tx_rb_l2_${uid}_${today}`,
            type: 'referral',
            bonusLevel: 2,
            amount: amtL2,
            network: 'USDT',
            status: 'completed',
            date: now.toISOString(),
            userId: l2Ref,
            funderId: uid,
            note: `Level 2 daily bonus (0.25%) from ${l1Entry.data.name || l1Id}'s referral ${u.data.name || uid}`,
          });
          pushNotification(
            l2Ref,
            'Daily Bonus Earned',
            `You earned ${amtL2.toFixed(2)} USDT Level 2 daily bonus from ${u.data.name || uid}'s balance.`,
            'success'
          );
          ops += 2;
          stats.paidL2++;
        }
      }
    }

    await batch.update(users.get(uid)!.ref, { dailyBonusPaidOn: today });
    ops += 1;
    stats.processed++;
    await commitIfFull();
  }

  if (ops > 0) await batch.commit();
  return stats;
}