import { runAutoVerifyOnce } from './autoVerifyCore';
import { processDailyReferralBonuses } from './referralBonuses';

let started = false;
let lastDailyBonusRun = 0;

function log(msg: string) {
  console.log(`[auto-verify] ${msg}`);
}

async function runDailyBonus() {
  try {
    const s = await processDailyReferralBonuses();
    if (s.processed + s.paidL1 + s.paidL2 + s.skipped > 0) {
      log(`daily bonus: processed=${s.processed} paidL1=${s.paidL1} paidL2=${s.paidL2} already=${s.skipped}`);
    }
  } catch (e: any) {
    console.error('[auto-verify] daily bonus error:', e?.message || e);
  }
}

async function tick() {
  if (Date.now() - lastDailyBonusRun > 60 * 60 * 1000) {
    lastDailyBonusRun = Date.now();
    await runDailyBonus();
  }
  const r = await runAutoVerifyOnce();
  if (!r) return; // a run is already in progress
  if (!r.success) {
    log(`skipped: ${r.error || 'not configured'}`);
    return;
  }
  if (r.pendingCount === 0) return;
  log(
    `pending=${r.pendingCount} matched=${r.matched.length} newlyCredited=${r.newlyCredited.length} ` +
      `receipt=${r.verifiedByReceipt} logscan=${r.verifiedByLogScan} failed=${r.failedCount || 0}`
  );
}

export function startAutoVerifyScheduler(intervalMs = 45000) {
  if (started) return;
  started = true;
  log(`scheduler started (every ${intervalMs}ms)`);
  setTimeout(() => void tick(), 3000); // first run shortly after boot
  setInterval(() => void tick(), intervalMs);
}

// Instant trigger: called (fire-and-forget) right after a deposit is created.
export function triggerAutoVerify() {
  tick().catch((e) => console.error('[auto-verify] trigger error:', e?.message || e));
}