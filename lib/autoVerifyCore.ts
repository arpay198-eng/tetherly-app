import { getAdminDb } from '@/lib/firebaseAdmin';
import { pushNotification } from '@/lib/notifications';

const USDT_BEP20_CONTRACT = '0x55d398326f99059ff775485246999027b3197955';
const USDT_BEP20_DECIMALS = 18;
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const TOLERANCE_USDT = 0.01;
const TRANSFER_WINDOW_MS = 72 * 60 * 60 * 1000;
// Auto-fail pending deposits that never arrived on-chain (24-hour window).
const DEPOSIT_EXPIRE_MS = 24 * 60 * 60 * 1000;
const MAX_RETRY_COUNT = 3;
const BSC_AVG_BLOCK_MS = 3000;
const CHUNK_BLOCKS = 8000;
const RPC_RETRIES = 2;
const RPC_TIMEOUT_MS = 25000;
const REAL_HASH_RE = /^0x[0-9a-fA-F]{64}$/;

// Receipt lookups work on Binance public dataseeds (lightweight method).
const RECEIPT_RPCS = [
  'https://bsc-dataseed1.binance.org',
  'https://bsc-dataseed2.binance.org',
  'https://bsc-dataseed3.binance.org',
  'https://bsc-dataseed.binance.org',
];
// eth_getLogs is only served by publicnode on the free tier, and only for the
// most recent ~12k blocks. Used as a fallback for deposits without a tx hash.
const LOG_RPCS = ['https://bsc-rpc.publicnode.com'];

function isPlaceholder(value: string | undefined): boolean {
  if (!value) return true;
  const v = value.trim();
  return v === '' || v.includes('XXX') || v.includes('yourbscscan') || v.includes('your_api');
}

function normalizeAddress(addr: string): string {
  return addr.trim().toLowerCase();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function jsonRpc(endpoint: string, method: string, params: unknown[]): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RPC_TIMEOUT_MS);
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 }),
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`${method}: HTTP ${res.status}`);
    const data = await res.json();
    if (data.error) throw new Error(`${method}: RPC error ${data.error.message}`);
    return data.result;
  } finally {
    clearTimeout(timer);
  }
}

async function rpcCallWithRetry(method: string, params: unknown[], endpoints: string[]): Promise<any> {
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < RPC_RETRIES; attempt++) {
    for (const endpoint of endpoints) {
      try {
        return await jsonRpc(endpoint, method, params);
      } catch (e) {
        lastErr = e;
      }
    }
    if (attempt < RPC_RETRIES - 1) await sleep(600);
  }
  throw new Error(`All BSC RPC endpoints failed for ${method}: ${(lastErr as Error)?.message || 'unknown error'}`);
}

// eth_getTransactionReceipt → does the tx contain a successful USDT Transfer to our wallet?
async function receiptMatches(txHash: string, wallet: string, expectedAmount: number): Promise<boolean> {
  const receipt = await rpcCallWithRetry('eth_getTransactionReceipt', [txHash], RECEIPT_RPCS);
  if (!receipt) return false;
  if (receipt.status !== '0x1') return false;
  const logs = Array.isArray(receipt.logs) ? receipt.logs : [];
  for (const log of logs) {
    if (!log?.address || normalizeAddress(log.address) !== USDT_BEP20_CONTRACT) continue;
    if (!log.topics || normalizeAddress(log.topics[0]) !== TRANSFER_TOPIC) continue;
    const to = '0x' + (log.topics[2] || '').slice(-40);
    if (normalizeAddress(to) !== wallet.toLowerCase()) continue;
    const amount = Number(BigInt(log.data || '0x0')) / Math.pow(10, USDT_BEP20_DECIMALS);
    if (isNaN(amount) || amount <= 0) continue;
    if (Math.abs(amount - expectedAmount) <= TOLERANCE_USDT) return true;
  }
  return false;
}

// eth_getLogs over the recent window (publicnode constraint) → incoming USDT transfers to the wallet.
async function fetchWalletIncomingTransfers(wallet: string): Promise<any[]> {
  const paddedWallet = '0x000000000000000000000000' + wallet.replace(/^0x/, '').toLowerCase();
  const topics: (string | null)[] = [TRANSFER_TOPIC, null, paddedWallet];

  const latestBlock = BigInt(await rpcCallWithRetry('eth_blockNumber', [], RECEIPT_RPCS));
  // publicnode only allows recent ranges; cap the scan window at ~10k blocks (~8h).
  const windowBlocks = Math.min(Math.max(1, Math.ceil(TRANSFER_WINDOW_MS / BSC_AVG_BLOCK_MS)), 10000);
  const fromBlock = latestBlock - BigInt(windowBlocks);

  const transfers: any[] = [];
  let start = fromBlock;
  while (start <= latestBlock) {
    const end = start + BigInt(CHUNK_BLOCKS - 1) < latestBlock ? start + BigInt(CHUNK_BLOCKS - 1) : latestBlock;
    const result = await rpcCallWithRetry(
      'eth_getLogs',
      [
        {
          address: USDT_BEP20_CONTRACT,
          topics,
          fromBlock: '0x' + start.toString(16),
          toBlock: '0x' + end.toString(16),
        },
      ],
      LOG_RPCS
    );
    if (Array.isArray(result)) transfers.push(...result);
    start = end + BigInt(1);
    await sleep(200);
  }
  return transfers;
}

function logToTransfer(log: any) {
  return {
    hash: log?.transactionHash || '',
    amount: Number(BigInt(log?.data || '0x0')) / Math.pow(10, USDT_BEP20_DECIMALS),
    blockNumber: parseInt(log?.blockNumber || '0x0', 16),
  };
}

interface DepositDoc {
  id: string;
  userId?: string;
  userEmail?: string;
  amount: number;
  network?: string;
  txHash?: string;
  status?: string;
  date?: string;
  autoVerified?: boolean;
  retryCount?: number;
  lastRetryAt?: string;
}

interface VerifyOutcome {
  verified: boolean;
  credited: boolean;
  reason?: string;
}

// Finds the users doc reference for a deposit (by userId, then by email).
async function resolveUserRef(deposit: DepositDoc): Promise<{ ref: any; balance: number; depositBalance?: number } | null> {
  const adminDb = getAdminDb();
  if (deposit.userId) {
    const userRef = adminDb.collection('users').doc(String(deposit.userId));
    const snap = await userRef.get();
    if (snap.exists) {
      const d = snap.data();
      return { ref: userRef, balance: Number(d?.balance ?? 0), depositBalance: d?.depositBalance !== undefined ? Number(d.depositBalance) : undefined };
    }
  }
  if (deposit.userEmail) {
    const cleanEmail = String(deposit.userEmail).toLowerCase().trim();
    const userSnap = await adminDb.collection('users').where('email', '==', cleanEmail).limit(1).get();
    if (!userSnap.empty) {
      const s = userSnap.docs[0];
      const d = s.data();
      return { ref: s.ref, balance: Number(d?.balance ?? 0), depositBalance: d?.depositBalance !== undefined ? Number(d.depositBalance) : undefined };
    }
  }
  return null;
}

// Atomically marks the deposit completed and credits the user. Never double-credits
// because it runs inside a Firestore transaction guarded by status == 'pending'.
export async function finalizeDeposit(deposit: DepositDoc, amount: number, txHash: string, method: 'receipt' | 'logscan' | 'admin') {
  const adminDb = getAdminDb();
  const user = await resolveUserRef(deposit);
  if (!user) {
    // Still record that the chain verified it, but leave it pending for admin to resolve.
    await adminDb.collection('deposits').doc(deposit.id).set(
      { autoVerified: true, autoMatchedHash: txHash, autoMatchedAmount: amount, autoVerifiedBy: method, autoVerifiedAt: new Date().toISOString() },
      { merge: true }
    );
    return { verified: true, credited: false, reason: 'user_not_found' } as VerifyOutcome;
  }

  const depositRef = adminDb.collection('deposits').doc(deposit.id);
  const txDocRef = adminDb.collection('transactions').doc(`tx_${deposit.id}`);
  const hashKey = String(txHash || '').trim().toLowerCase();
  const usedRef = adminDb.collection('used_hashes').doc(hashKey);
  const now = new Date().toISOString();
  try {
    const txResult = await adminDb.runTransaction(async (tx) => {
      // Firestore requires all reads before any writes.
      const depSnap = await tx.get(depositRef);
      if (!depSnap.exists) throw new Error('deposit_missing');
      const dep = depSnap.data()!;
      if (dep.status !== 'pending') throw new Error('not_pending');

      const usedSnap = await tx.get(usedRef);
      const txSnap = await tx.get(txDocRef);

      // Same on-chain payment submitted as a second deposit → never credit twice.
      // SKIP for admin: admin manually approves, doesn't need on-chain duplicate check.
      if (method !== 'admin' && usedSnap.exists) {
        const first = (usedSnap.data() as any)?.depositId || null;
        await tx.update(depositRef, {
          status: 'failed',
          reviewedBy: 'auto-verify (duplicate tx hash)',
          reviewedAt: now,
          autoFailed: true,
          autoFailedReason: 'hash_already_used',
          duplicateOfDepositId: first,
        });
        return { condition: 'hash_already_used' as const };
      }

      await tx.update(depositRef, {
        status: 'completed',
        txHash,
        reviewedAt: now,
        reviewedBy: method === 'admin' ? 'admin approval' : `auto-verify (${method})`,
        autoVerified: true,
        autoMatchedHash: txHash,
        autoMatchedAmount: amount,
        autoVerifiedBy: method,
        autoVerifiedAt: now,
      });

      const newBalance = user.balance + amount;
      const prevDep = user.depositBalance !== undefined && user.depositBalance > 0
        ? user.depositBalance
        : user.balance;
      await tx.update(user.ref, {
        balance: newBalance,
        depositBalance: prevDep + amount,
        lastDepositDate: now,
        lastDepositAmount: amount,
        bonusClaimed: false,
      });

      if (txSnap.exists) {
        await tx.update(txDocRef, {
          status: 'completed',
          hash: txHash,
          userId: String(deposit.userId || ''),
        });
      } else {
        await tx.set(txDocRef, {
          id: `tx_${deposit.id}`,
          userId: String(deposit.userId || ''),
          type: 'deposit',
          amount,
          network: deposit.network || 'BEP20',
          status: 'completed',
          date: deposit.date || now,
          hash: txHash,
        });
      }

      await tx.set(usedRef, {
        hash: hashKey,
        depositId: deposit.id,
        amount,
        method,
        creditedAt: now,
      });
      return { condition: 'credited' as const };
    });

    if ((txResult as any)?.condition === 'hash_already_used') {
      return { verified: true, credited: false, reason: 'hash_already_used' } as VerifyOutcome;
    }

    // Notify the depositor that their deposit was credited.
    pushNotification(
      String(deposit.userId || ''),
      'Deposit Credited',
      `Your deposit of ${amount} USDT (${deposit.network || 'BEP20'}) was verified and credited to your balance.`,
      'success'
    );
    return { verified: true, credited: true } as VerifyOutcome;
  } catch (e: any) {
    if (e?.message === 'not_pending' || e?.message === 'deposit_missing') {
      return { verified: true, credited: false, reason: e.message } as VerifyOutcome;
    }
    console.error('finalizeDeposit error:', e?.message);
    return { verified: true, credited: false, reason: 'finalize_error' } as VerifyOutcome;
  }
}

export interface AutoVerifyResult {
  success: boolean;
  wallet?: string;
  error?: string;
  pendingCount: number;
  scannedLogs: number;
  verifiedByReceipt: number;
  verifiedByLogScan: number;
  matched: any[];
  newlyMatched: any[];
  credited: any[];
  newlyCredited: any[];
  failed: any[];
  failedCount: number;
  alreadyMatched: number;
}

export async function runAutoVerify(): Promise<AutoVerifyResult> {
  const wallet = process.env.TETHERLY_DEPOSIT_WALLET_BEP20 || process.env.NEXT_PUBLIC_DEPOSIT_WALLET_BEP20 || '';

  if (isPlaceholder(wallet)) {
    return {
      success: false,
      error: 'Auto-verify is not configured. Set TETHERLY_DEPOSIT_WALLET_BEP20 in .env.local, then restart the server.',
      pendingCount: 0,
      scannedLogs: 0,
      verifiedByReceipt: 0,
      verifiedByLogScan: 0,
      matched: [],
      newlyMatched: [],
      credited: [],
      newlyCredited: [],
      failed: [],
      failedCount: 0,
      alreadyMatched: 0,
    };
  }

  const adminDb = getAdminDb();

  // Load pending deposit requests
  const depositsSnap = await adminDb.collection('deposits').where('status', '==', 'pending').limit(100).get();
  const pending: DepositDoc[] = [];
  depositsSnap.forEach((s) => {
    const d = s.data() as DepositDoc;
    if (d?.status === 'pending' && Number(d?.amount) > 0) pending.push({ ...d, id: s.id });
  });

  if (pending.length === 0) {
    return {
      success: true,
      wallet,
      pendingCount: 0,
      scannedLogs: 0,
      verifiedByReceipt: 0,
      verifiedByLogScan: 0,
      matched: [],
      newlyMatched: [],
      credited: [],
      newlyCredited: [],
      failed: [],
      failedCount: 0,
      alreadyMatched: 0,
    };
  }

  const matched: any[] = [];
  const newlyMatched: any[] = [];
  const credited: any[] = [];
  const newlyCredited: any[] = [];
  const matchedDepositIds = new Set<string>();
  const usedTransferKeys = new Set<string>();
  const failed: any[] = [];

  // Pass A: per-deposit on-chain receipt verification (needs a real transaction hash).
  for (const deposit of pending) {
    const txHash = String(deposit.txHash || '').trim();
    if (!REAL_HASH_RE.test(txHash)) continue;
    const verifyKey = `r:${txHash.toLowerCase()}`;
    if (usedTransferKeys.has(verifyKey)) continue;

    // Retry tracking: increment retry count and check limit
    const currentRetry = deposit.retryCount || 0;
    if (currentRetry >= MAX_RETRY_COUNT) {
      // Already retried 3 times — auto-fail
      if (!matchedDepositIds.has(deposit.id)) {
        try {
          const nowIso = new Date().toISOString();
          await adminDb.collection('deposits').doc(deposit.id).update({
            status: 'failed',
            rejectReason: `Auto-failed after ${MAX_RETRY_COUNT} verification attempts`,
            reviewedBy: 'auto-verify (max retries exceeded)',
            reviewedAt: nowIso,
            autoFailed: true,
            autoFailedReason: 'max_retries_exceeded',
            autoFailedAt: nowIso,
            retryCount: currentRetry,
          });
          const txDirectRef = adminDb.collection('transactions').doc(`tx_${deposit.id}`);
          const txDirectSnap = await txDirectRef.get();
          if (txDirectSnap.exists) {
            await txDirectRef.update({ status: 'failed', rejectReason: 'Verification failed. Please contact support.' });
          }
          if (deposit.userId) {
            await pushNotification(
              String(deposit.userId),
              'Deposit Failed',
              `Your deposit of ${Number(deposit.amount).toFixed(2)} USDT could not be verified after ${MAX_RETRY_COUNT} attempts. Please contact support.`,
              'warning'
            );
          }
          failed.push({ depositId: deposit.id, amount: Number(deposit.amount), txHash });
        } catch (e: any) {
          console.warn(`auto-verify: auto-fail for max retries failed for ${deposit.id}:`, e?.message);
        }
        matchedDepositIds.add(deposit.id);
      }
      continue;
    }

    // Increment retry count
    try {
      await adminDb.collection('deposits').doc(deposit.id).update({
        retryCount: currentRetry + 1,
        lastRetryAt: new Date().toISOString(),
      });
    } catch (e: any) {
      console.warn(`auto-verify: retry increment failed for ${deposit.id}:`, e?.message);
    }

    try {
      const ok = await receiptMatches(txHash, wallet, Number(deposit.amount));
      if (!ok) continue;
      usedTransferKeys.add(verifyKey);
      matchedDepositIds.add(deposit.id);
      const outcome = await finalizeDeposit(deposit, Number(deposit.amount), txHash, 'receipt');
      const isNew = !deposit.autoVerified;
      matched.push({ depositId: deposit.id, amount: Number(deposit.amount), txHash, method: 'receipt', credited: outcome.credited });
      if (isNew) newlyMatched.push({ depositId: deposit.id, amount: Number(deposit.amount), txHash, method: 'receipt' });
      if (outcome.credited) {
        credited.push({ depositId: deposit.id, amount: Number(deposit.amount), txHash, method: 'receipt' });
        if (isNew) newlyCredited.push({ depositId: deposit.id, amount: Number(deposit.amount), txHash });
      }
    } catch (e: any) {
      console.warn(`auto-verify: receipt check failed for ${txHash}:`, e?.message);
    }
  }

  // Pass B: recent block-log scan fallback (only for deposits without a real
  // transaction hash — a real-hash deposit is already receipt-checked in Pass A).
  let incoming: any[] = [];
  const needsLogScan = pending.some(
    (p) => !matchedDepositIds.has(p.id) && !REAL_HASH_RE.test(String(p.txHash || ''))
  );
  if (needsLogScan) {
    try {
      const logs = await fetchWalletIncomingTransfers(normalizeAddress(wallet));
      incoming = logs.map(logToTransfer).filter((t) => t.hash);
      for (const t of incoming) {
        if (usedTransferKeys.has(`l:${t.hash}`)) continue;
        const deposit = pending.find(
          (p) => !matchedDepositIds.has(p.id) && Math.abs(Number(p.amount) - t.amount) <= TOLERANCE_USDT
        );
        if (!deposit) continue;
        usedTransferKeys.add(`l:${t.hash}`);
        matchedDepositIds.add(deposit.id);
        const outcome = await finalizeDeposit(deposit, t.amount, t.hash, 'logscan');
        const isNew = !deposit.autoVerified;
        matched.push({ depositId: deposit.id, amount: t.amount, txHash: t.hash, method: 'logscan', credited: outcome.credited });
        if (isNew) newlyMatched.push({ depositId: deposit.id, amount: t.amount, txHash: t.hash, method: 'logscan' });
        if (outcome.credited) {
          credited.push({ depositId: deposit.id, amount: t.amount, txHash: t.hash, method: 'logscan' });
          if (isNew) newlyCredited.push({ depositId: deposit.id, amount: t.amount, txHash: t.hash });
        }
      }
    } catch (e: any) {
      console.warn('auto-verify: log scan failed:', e?.message);
    }
  }

  // Pass C: auto-expire deposits that never actually arrived on-chain (24-hour window).
  const expireBefore = Date.now() - DEPOSIT_EXPIRE_MS;
  for (const deposit of pending) {
    if (matchedDepositIds.has(deposit.id)) continue;
    const raw = deposit.date;
    const createdMs = raw ? new Date(raw).getTime() : 0;
    if (!createdMs || createdMs > expireBefore) continue;
    try {
      const nowIso = new Date().toISOString();
      const failReason = 'Deposit expired (not received on blockchain within 24 hours)';
      await adminDb.collection('deposits').doc(deposit.id).update({
        status: 'failed',
        rejectReason: failReason,
        reviewedBy: 'auto-verify (not received in 24h)',
        reviewedAt: nowIso,
        autoFailed: true,
        autoFailedReason: 'not_received',
        autoFailedAt: nowIso,
      });

      // Atomically mark matching transaction record as failed
      const txDirectRef = adminDb.collection('transactions').doc(`tx_${deposit.id}`);
      const txDirectSnap = await txDirectRef.get();
      if (txDirectSnap.exists) {
        await txDirectRef.update({
          status: 'failed',
          rejectReason: failReason,
        });
      }
      if (deposit.txHash) {
        const txSnap = await adminDb.collection('transactions').where('hash', '==', deposit.txHash).get();
        if (!txSnap.empty) {
          const batch = adminDb.batch();
          txSnap.forEach((d) => batch.update(d.ref, { status: 'failed', rejectReason: failReason }));
          await batch.commit();
        }
      }

      if (deposit.userId) {
        await pushNotification(
          String(deposit.userId),
          'Deposit Expired',
          `Your deposit of ${Number(deposit.amount).toFixed(2)} USDT expired because payment was not detected on-chain within 24 hours.`,
          'warning'
        );
      }

      failed.push({ depositId: deposit.id, amount: Number(deposit.amount), txHash: deposit.txHash || null });
    } catch (e: any) {
      console.warn(`auto-verify: auto-fail failed for ${deposit.id}:`, e?.message);
    }
  }

  return {
    success: true,
    wallet,
    pendingCount: pending.length,
    scannedLogs: incoming.length,
    verifiedByReceipt: matched.filter((m) => m.method === 'receipt').length,
    verifiedByLogScan: matched.filter((m) => m.method === 'logscan').length,
    matched,
    newlyMatched,
    credited,
    newlyCredited,
    failed,
    failedCount: failed.length,
    alreadyMatched: matched.length - newlyMatched.length,
  };
}

// Single-flight guard so the scheduler and instant deposit trigger never run
// concurrently. Returns null when another verify run is already in progress.
let verifyRunning = false;
export async function runAutoVerifyOnce(): Promise<AutoVerifyResult | null> {
  if (verifyRunning) return null;
  verifyRunning = true;
  try {
    return await runAutoVerify();
  } finally {
    verifyRunning = false;
  }
}