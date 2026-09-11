import * as fs from 'fs';
import * as path from 'path';

// In-memory TTL cache and persistent disk-backed fallback store for Firestore API routes.
// Prevents Firestore free quota exhaustion by collapsing rapid polling requests
// and providing resilient fallback if Firestore hits rate/quota limits.

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const memoryStore = new Map<string, CacheEntry<any>>();
const SNAPSHOT_FILE = path.join(process.cwd(), 'data', 'cache-snapshot.json');

interface SnapshotData {
  users: any[];
  withdrawals: any[];
  deposits: any[];
  transactions: any[];
}

let snapshotCache: SnapshotData = {
  users: [],
  withdrawals: [],
  deposits: [],
  transactions: [],
};

// Load snapshot on boot
function loadSnapshot() {
  try {
    if (fs.existsSync(SNAPSHOT_FILE)) {
      const content = fs.readFileSync(SNAPSHOT_FILE, 'utf8');
      snapshotCache = JSON.parse(content);
      if (!Array.isArray(snapshotCache.users)) snapshotCache.users = [];
      if (!Array.isArray(snapshotCache.withdrawals)) snapshotCache.withdrawals = [];
      if (!Array.isArray(snapshotCache.deposits)) snapshotCache.deposits = [];
      if (!Array.isArray(snapshotCache.transactions)) snapshotCache.transactions = [];
    }
  } catch (e) {
    console.error('[apiCache] Failed to read snapshot file:', e);
  }
}

loadSnapshot();

function persistSnapshot() {
  try {
    fs.writeFileSync(SNAPSHOT_FILE, JSON.stringify(snapshotCache, null, 2), 'utf8');
  } catch (e) {
    console.error('[apiCache] Failed to write snapshot file:', e);
  }
}

export function getCached<T>(key: string, ttlMs: number = 8000): T | null {
  const entry = memoryStore.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > ttlMs) {
    return null; // Expired
  }
  return entry.data;
}

export function getFallback<T>(key: string): T | null {
  loadSnapshot();
  const entry = memoryStore.get(key);
  if (entry) return entry.data;

  // Key-based fallback from persistent snapshot
  if (key.startsWith('withdrawals:')) {
    return snapshotCache.withdrawals as unknown as T;
  }
  if (key.startsWith('deposits:')) {
    return snapshotCache.deposits as unknown as T;
  }
  if (key.startsWith('transactions:')) {
    return snapshotCache.transactions as unknown as T;
  }
  if (key.startsWith('users:')) {
    return snapshotCache.users as unknown as T;
  }
  return null;
}

export function setCached<T>(key: string, data: T): void {
  memoryStore.set(key, {
    data,
    timestamp: Date.now(),
  });
}

export function invalidateCache(prefix: string): void {
  memoryStore.forEach((_, key) => {
    if (key.startsWith(prefix)) {
      memoryStore.delete(key);
    }
  });
}

// Direct data accessors & mutators for offline/quota-exhausted resilience

export function getUserById(id: string): any | null {
  loadSnapshot();
  return snapshotCache.users.find((u) => String(u.id) === String(id)) || null;
}

export function getUserByEmail(email: string): any | null {
  loadSnapshot();
  const clean = String(email || '').trim().toLowerCase();
  return snapshotCache.users.find((u) => String(u.email || '').trim().toLowerCase() === clean) || null;
}

export function saveUserRecord(user: any): void {
  const idx = snapshotCache.users.findIndex((u) => String(u.id) === String(user.id));
  if (idx >= 0) {
    snapshotCache.users[idx] = { ...snapshotCache.users[idx], ...user };
  } else {
    snapshotCache.users.unshift(user);
  }
  persistSnapshot();
  invalidateCache('users:');
}

export function getWithdrawalsList(userId?: string | null, status?: string | null): any[] {
  loadSnapshot();
  let list = [...snapshotCache.withdrawals];
  if (userId) list = list.filter((w) => String(w.userId) === String(userId));
  if (status) list = list.filter((w) => w.status === status);
  return list.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
}

export function saveWithdrawalRecord(wd: any): void {
  const idx = snapshotCache.withdrawals.findIndex((w) => String(w.id) === String(wd.id));
  if (idx >= 0) {
    snapshotCache.withdrawals[idx] = { ...snapshotCache.withdrawals[idx], ...wd };
  } else {
    snapshotCache.withdrawals.unshift(wd);
  }
  persistSnapshot();
  invalidateCache('withdrawals:');
}

export function getDepositsList(userId?: string | null, status?: string | null): any[] {
  loadSnapshot();
  let list = [...snapshotCache.deposits];
  if (userId) list = list.filter((d) => String(d.userId) === String(userId));
  if (status) list = list.filter((d) => d.status === status);
  return list.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
}

export function saveDepositRecord(dp: any): void {
  const idx = snapshotCache.deposits.findIndex((d) => String(d.id) === String(dp.id));
  if (idx >= 0) {
    snapshotCache.deposits[idx] = { ...snapshotCache.deposits[idx], ...dp };
  } else {
    snapshotCache.deposits.unshift(dp);
  }
  persistSnapshot();
  invalidateCache('deposits:');
}

export function getTransactionsList(userId?: string | null, type?: string | null, status?: string | null): any[] {
  loadSnapshot();
  let list = [...snapshotCache.transactions];
  if (userId) list = list.filter((t) => String(t.userId) === String(userId));
  if (type) list = list.filter((t) => t.type === type);
  if (status) list = list.filter((t) => t.status === status);
  return list.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
}

export function saveTransactionRecord(tx: any): void {
  const idx = snapshotCache.transactions.findIndex((t) => String(t.id) === String(tx.id));
  if (idx >= 0) {
    snapshotCache.transactions[idx] = { ...snapshotCache.transactions[idx], ...tx };
  } else {
    snapshotCache.transactions.unshift(tx);
  }
  persistSnapshot();
  invalidateCache('transactions:');
}

export async function withTimeout<T>(promise: Promise<T>, ms: number = 2000, fallbackVal?: T): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeoutPromise = new Promise<T>((resolve, reject) => {
    timer = setTimeout(() => {
      if (fallbackVal !== undefined) {
        resolve(fallbackVal);
      } else {
        reject(new Error(`Firestore operation timed out after ${ms}ms`));
      }
    }, ms);
  });
  try {
    const res = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timer!);
    return res;
  } catch (err) {
    clearTimeout(timer!);
    throw err;
  }
}
