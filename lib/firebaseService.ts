import {
  collection,
  onSnapshot,
  query,
  orderBy,
  limit,
} from 'firebase/firestore';
import { db } from './firebase';
import { AdminUserItem, Transaction, WithdrawalRequest, DepositRequest } from '@/store/useStore';

const API_BASE = '/api';

const TOKEN_KEY = 'tetherly_auth';
const LEGACY_TOKEN_KEY = 'tetherly_auth_token';

export function getAuthToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY) || localStorage.getItem(LEGACY_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAuthToken(token: string | null) {
  try {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(LEGACY_TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(LEGACY_TOKEN_KEY);
    }
  } catch {
    // ignore storage failures
  }
}

export async function apiPost(path: string, body: any) {
  const token = getAuthToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error || 'API request failed');
  }
  return res.json();
}

export async function apiGet(path: string) {
  const token = getAuthToken();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, { method: 'GET', headers, cache: 'no-store' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error || 'API request failed');
  }
  return res.json();
}

export async function syncUserToFirestore(user: AdminUserItem) {
  try {
    await apiPost('/users', {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone || '',
      balance: user.balance,
      status: user.status,
      joinedDate: user.joinedDate,
      password: user.password || '',
      lastDepositDate: user.lastDepositDate || null,
      lastDepositAmount: user.lastDepositAmount || 0,
      bonusClaimed: user.bonusClaimed || false,
      referredBy: user.referredBy || '',
      depositBalance: user.depositBalance !== undefined ? user.depositBalance : undefined,
    });
  } catch (error) {
    console.error('Error syncing user to Firestore:', error);
  }
}

export async function syncWithdrawalToFirestore(request: WithdrawalRequest) {
  try {
    await apiPost('/withdrawals', {
      id: request.id,
      userId: request.userId,
      userName: request.userName || '',
      userEmail: request.userEmail || '',
      amount: request.amount,
      address: request.address,
      network: request.network,
      status: request.status,
      date: request.date,
    });
  } catch (error) {
    console.error('Error syncing withdrawal to Firestore:', error);
  }
}

export async function syncDepositToFirestore(request: DepositRequest) {
  try {
    await apiPost('/deposits', {
      id: request.id,
      userId: request.userId,
      userName: request.userName || '',
      userEmail: request.userEmail || '',
      amount: request.amount,
      network: request.network,
      txHash: request.txHash || '',
      status: request.status,
      date: request.date,
    });
  } catch (error) {
    console.error('Error syncing deposit to Firestore:', error);
  }
}

export async function syncTransactionToFirestore(tx: Transaction) {
  try {
    await apiPost('/transactions', {
      id: tx.id,
      type: tx.type,
      amount: tx.amount,
      network: tx.network,
      status: tx.status,
      date: tx.date,
      hash: tx.hash,
    });
  } catch (error) {
    console.error('Error syncing transaction to Firestore:', error);
  }
}

export function listenToUsers(onUpdate: (users: AdminUserItem[]) => void) {
  try {
    const usersRef = collection(db, 'users');
    return onSnapshot(usersRef, (snapshot) => {
      const users: AdminUserItem[] = [];
      snapshot.forEach((docSnap) => {
        users.push(docSnap.data() as AdminUserItem);
      });
      if (users.length > 0) onUpdate(users);
    }, (error) => {
      console.warn('[Firebase] listenToUsers error:', error?.message);
    });
  } catch (err) {
    console.warn('[Firebase] listenToUsers catch:', err);
    return () => {};
  }
}

export function listenToWithdrawals(onUpdate: (requests: WithdrawalRequest[]) => void) {
  try {
    const q = query(
      collection(db, 'withdrawals'),
      orderBy('date', 'desc'),
      limit(100)
    );
    return onSnapshot(q, (snapshot) => {
      const list: WithdrawalRequest[] = [];
      snapshot.forEach((docSnap) => list.push(docSnap.data() as WithdrawalRequest));
      if (list.length > 0) onUpdate(list);
    }, (error) => {
      console.warn('[Firebase] listenToWithdrawals error:', error?.message);
    });
  } catch (err) {
    console.warn('[Firebase] listenToWithdrawals catch:', err);
    return () => {};
  }
}

export function listenToDeposits(onUpdate: (requests: DepositRequest[]) => void) {
  try {
    const q = query(
      collection(db, 'deposits'),
      orderBy('date', 'desc'),
      limit(100)
    );
    return onSnapshot(q, (snapshot) => {
      const list: DepositRequest[] = [];
      snapshot.forEach((docSnap) => list.push(docSnap.data() as DepositRequest));
      onUpdate(list);
    }, (error) => {
      console.warn('[Firebase] listenToDeposits error:', error?.message);
    });
  } catch (err) {
    console.warn('[Firebase] listenToDeposits catch:', err);
    return () => {};
  }
}

export function listenToTransactions(onUpdate: (txs: Transaction[]) => void) {
  try {
    const q = query(
      collection(db, 'transactions'),
      orderBy('date', 'desc'),
      limit(100)
    );
    return onSnapshot(q, (snapshot) => {
      const list: Transaction[] = [];
      snapshot.forEach((docSnap) => list.push(docSnap.data() as Transaction));
      if (list.length > 0) onUpdate(list);
    }, (error) => {
      console.warn('[Firebase] listenToTransactions error:', error?.message);
    });
  } catch (err) {
    console.warn('[Firebase] listenToTransactions catch:', err);
    return () => {};
  }
}

export async function seedFirestoreIfEmpty() {
  // Auto-seeding disabled to keep database clean and pristine
}
