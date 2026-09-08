import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  syncUserToFirestore,
  syncWithdrawalToFirestore,
  syncDepositToFirestore,
  syncTransactionToFirestore,
  setAuthToken,
  apiPost,
  apiGet,
} from '@/lib/firebaseService';

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  isAdmin: boolean;
  kycStatus: 'none' | 'pending' | 'verified';
  referralCode: string;
  referredBy?: string | null;
  referredByName?: string | null;
  referralCount?: number;
  referralEarned?: number;
  referralEarnedLevel2?: number;
  dailyBonusPaidOn?: string | null;
}

export interface Wallet {
  balance: number;
  depositBalance: number;
  bonusBalance: number;
}

export interface Transaction {
  id: string;
  type: 'deposit' | 'withdrawal' | 'bonus' | 'referral';
  amount: number;
  network: 'BEP20';
  status: 'completed' | 'pending' | 'failed';
  date: string;
  hash?: string;
}

export interface Notification {
  id: string;
  title: string;
  message: string;
  read: boolean;
  date: string;
  type: 'info' | 'success' | 'warning';
}

export interface WithdrawalRequest {
  id: string;
  userId?: string;
  userName?: string;
  userEmail?: string;
  amount: number;
  address: string;
  network: 'BEP20';
  status: 'pending' | 'processing' | 'completed' | 'rejected';
  date: string;
}

export interface DepositRequest {
  id: string;
  userId?: string;
  userName?: string;
  userEmail?: string;
  amount: number;
  network: 'BEP20';
  txHash?: string;
  status: 'pending' | 'completed' | 'rejected';
  date: string;
  reviewedAt?: string;
  reviewedBy?: string;
  rejectReason?: string;
  autoVerified?: boolean;
  autoMatchedHash?: string;
  autoMatchedAmount?: number;
  autoVerifiedAt?: string;
}

export interface AdminUserItem {
  id: string;
  name: string;
  email: string;
  password?: string;
  phone?: string;
  balance: number;
  status: 'active' | 'blocked';
  joinedDate: string;
  role?: string;
  isAdmin?: boolean;
  lastDepositDate?: string | null;
  lastDepositAmount?: number;
  bonusClaimed?: boolean;
  depositBalance?: number;
  referralCode?: string;
  referredBy?: string | null;
  referredByName?: string | null;
  referralBonusPaid?: boolean;
}

export interface AppState {
  user: User | null;
  wallet: Wallet;
  transactions: Transaction[];
  notifications: Notification[];
  withdrawalRequests: WithdrawalRequest[];
  depositRequests: DepositRequest[];
  allUsers: AdminUserItem[];
  isLoggedIn: boolean;
  lastDepositDate: string | null;
  lastDepositAmount: number;
  bonusClaimed: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  register: (name: string, email: string, phone: string, password: string, referralInput?: string) => Promise<boolean>;
  logout: () => void;
  deposit: (amount: number, network: 'BEP20', txHash?: string) => DepositRequest | null;
  approveDeposit: (id: string, hash?: string) => void;
  rejectDeposit: (id: string, reason?: string) => void;
  withdraw: (amount: number, address: string, network: 'BEP20', confirmPassword?: string) => Promise<boolean>;
  claimBonus: () => Promise<boolean>;
  markNotificationRead: (id: string) => void;
  markAllRead: () => void;
  loadNotifications: () => Promise<void>;
  addTransaction: (tx: Omit<Transaction, 'id' | 'date'>) => void;
  addNotification: (n: Omit<Notification, 'id' | 'date' | 'read'>) => void;
  approveWithdrawal: (id: string, hash?: string) => void;
  rejectWithdrawal: (id: string, reason?: string) => void;
  updateUserBalance: (userId: string, newBalance: number) => void;
  creditUser: (userId: string, amount: number, note?: string) => void;
  debitUser: (userId: string, amount: number, note?: string) => void;
  toggleUserStatus: (userId: string) => void;
  setAllUsers: (users: AdminUserItem[]) => void;
  setWithdrawalRequests: (requests: WithdrawalRequest[]) => void;
  setDepositRequests: (requests: DepositRequest[]) => void;
  setTransactions: (transactions: Transaction[]) => void;
}

const generateUid = (): string => {
  return String(Math.floor(1000000000 + Math.random() * 9000000000));
};

const testUsers = [
  { email: 'admin@tetherly.com', password: 'admin123', name: 'Admin User', id: generateUid() },
  { email: 'rohim.badsha198@gmail.com', password: 'Rj6542', name: 'Rahim Badsha', id: generateUid() },
];

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
  user: null,
  wallet: { balance: 0, depositBalance: 0, bonusBalance: 0 },
  transactions: [],
  notifications: [],
  withdrawalRequests: [],
  depositRequests: [],
  allUsers: [
    {
      id: '2817782317',
      name: 'Rahim Badsha',
      email: 'rohim.badsha198@gmail.com',
      password: 'Rj6542',
      balance: 0,
      status: 'active',
      joinedDate: '2026-09-07',
    },
  ],
  isLoggedIn: false,
  lastDepositDate: null,
  lastDepositAmount: 0,
  bonusClaimed: false,

  login: async (email: string, password: string) => {
    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password.trim();

    // Server-verified login via /api/auth (Firestore is the source of truth).
    const res = await apiPost('/auth', { email: cleanEmail, password: cleanPassword });
    if (!res || !res.token || !res.user) return false;

    setAuthToken(res.token);
    const rec = res.user;

    const currentTx = get().transactions.filter((t) => t.id.includes(rec.id));

    set({
      user: {
        id: rec.id,
        name: rec.name || '',
        email: rec.email || '',
        phone: rec.phone || '',
        isAdmin: !!rec.isAdmin,
        kycStatus: 'none',
        referralCode: rec.referralCode || `TETH${String(rec.id).slice(-4).toUpperCase()}`,
        referredBy: rec.referredBy || null,
        referredByName: rec.referredByName || null,
        referralCount: rec.referralCount || 0,
        referralEarned: rec.referralEarned || 0,
        referralEarnedLevel2: rec.referralEarnedLevel2 || 0,
      },
      wallet: {
        balance: rec.balance,
        depositBalance: rec.depositBalance !== undefined ? rec.depositBalance : rec.balance,
        bonusBalance: rec.bonusBalance || 0,
      },
      transactions: currentTx,
      isLoggedIn: true,
      lastDepositDate: rec.lastDepositDate || null,
      lastDepositAmount: rec.lastDepositAmount || 0,
      bonusClaimed: rec.bonusClaimed || false,
    });
    void get().loadNotifications();
    return true;
  },

  register: async (name: string, email: string, phone: string, password: string, referralInput?: string) => {
    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password.trim();

    if (get().allUsers.find((u) => u.email.toLowerCase() === cleanEmail)) return false;
    if (testUsers.find((u) => u.email.toLowerCase() === cleanEmail)) return false;

    const id = generateUid();
    const cleanRef = (referralInput || '').trim().toUpperCase();

    // Single server-verified create. Throws on error so the UI can show the
    // server's real message (e.g. "Email already registered..."). No second
    // client-side write — that used to create the account on the server while
    // the UI falsely reported failure.
    const res = await apiPost('/users', {
      id,
      name: name.trim(),
      email: cleanEmail,
      phone: phone ? phone.trim() : '',
      balance: 0,
      status: 'active',
      joinedDate: new Date().toISOString().split('T')[0],
      password: cleanPassword,
      referredBy: cleanRef || '',
    });
    const serverId = String(res?.id || id);
    const serverReferralCode = String(res?.referralCode || `TETH${serverId.slice(-4).toUpperCase()}`);

    set({
      user: {
        id: serverId,
        name: name.trim(),
        email: cleanEmail,
        phone: phone ? phone.trim() : '',
        isAdmin: false,
        kycStatus: 'none',
        referralCode: serverReferralCode,
        referredBy: cleanRef || null,
        referredByName: null,
        referralCount: 0,
        referralEarned: 0,
        referralEarnedLevel2: 0,
      },
      allUsers: [...get().allUsers],
      wallet: { balance: 0, depositBalance: 0, bonusBalance: 0 },
      notifications: [
        { id: 'notif_welcome', title: 'Welcome to Tetherly', message: 'Your account is ready. Make a deposit to get started!', read: false, date: new Date().toISOString(), type: 'success' },
        ...get().notifications,
      ],
      isLoggedIn: true,
      lastDepositDate: null,
      lastDepositAmount: 0,
      bonusClaimed: false,
    });

    // Obtain a session token for the new account.
    try {
      const res = await apiPost('/auth', { email: cleanEmail, password: cleanPassword });
      if (res && res.token) setAuthToken(res.token);
      if (res && res.user) {
        set({
          user: {
            id: res.user.id,
            name: res.user.name || '',
            email: res.user.email || '',
            phone: res.user.phone || '',
            isAdmin: !!res.user.isAdmin,
            kycStatus: 'none',
            referralCode: res.user.referralCode || `TETH${String(res.user.id).slice(-4).toUpperCase()}`,
            referredBy: res.user.referredBy || null,
            referredByName: res.user.referredByName || null,
            referralCount: res.user.referralCount || 0,
            referralEarned: res.user.referralEarned || 0,
            referralEarnedLevel2: res.user.referralEarnedLevel2 || 0,
          },
        });
      }
    } catch (error) {
      console.error('Auto-login after register failed:', error);
    }
    void get().loadNotifications();
    return true;
  },

  logout: () => {
    setAuthToken(null);
    set({
      user: null,
      wallet: { balance: 0, depositBalance: 0, bonusBalance: 0 },
      isLoggedIn: false,
      lastDepositDate: null,
      lastDepositAmount: 0,
      bonusClaimed: false,
      // Clear ALL data to prevent one user's data leaking to the next.
      transactions: [],
      notifications: [],
      withdrawalRequests: [],
      depositRequests: [],
      allUsers: [],
    });
  },

  deposit: (amount: number, network: 'BEP20', txHash?: string): DepositRequest | null => {
    const { user } = get();
    if (!user || amount <= 0) return null;

    const depId = `dep_${Date.now()}`;
    const hash = txHash?.trim() || `${network}_${Math.random().toString(36).slice(2, 12).toUpperCase()}`;

    const req: DepositRequest = {
      id: depId,
      userId: user.id,
      userName: user.name,
      userEmail: user.email,
      amount,
      network,
      txHash: hash,
      status: 'pending',
      date: new Date().toISOString(),
    };

    const tx: Transaction = {
      id: `tx_${depId}`,
      type: 'deposit',
      amount,
      network,
      status: 'pending',
      date: new Date().toISOString(),
      hash,
    };

    set({
      depositRequests: [req, ...get().depositRequests],
      transactions: [tx, ...get().transactions],
      notifications: [
        {
          id: `notif_${depId}`,
          title: 'Deposit Submitted',
          message: `Your deposit of ${amount} USDT (${network}) has been submitted for verification.`,
          read: false,
          date: new Date().toISOString(),
          type: 'info',
        },
        ...get().notifications,
      ],
    });

    syncDepositToFirestore(req);
    syncTransactionToFirestore(tx);
    return req;
  },

  withdraw: async (amount: number, address: string, network: 'BEP20', confirmPassword?: string) => {
    const { wallet, user, allUsers, lastDepositDate, lastDepositAmount } = get();
    if (!user || amount > wallet.balance) return false;

    // Deposit lock: the deposit principal is locked for 24h from the latest deposit.
    if (lastDepositDate && lastDepositAmount > 0) {
      const lockedUntil = new Date(lastDepositDate).getTime() + 24 * 60 * 60 * 1000;
      if (Date.now() < lockedUntil) return false;
    }

    // Verify account is active
    const userRecord = allUsers.find((u) => u.id === user.id);
    if (userRecord && userRecord.status === 'blocked') return false;

    const reqId = `wd_${Date.now()}`;
    const req: WithdrawalRequest = {
      id: reqId,
      userId: user.id,
      userName: user.name,
      userEmail: user.email,
      amount,
      address,
      network,
      status: 'pending',
      date: new Date().toISOString(),
    };

    // Server-side: balance is deducted atomically and locked for 24h deposit window.
    let res: any;
    try {
      res = await apiPost('/withdrawals', { ...req, confirmPassword });
    } catch (error: any) {
      throw new Error(error?.message || 'Withdrawal failed');
    }
    if (!res || !res.success) return false;

    const updated = res.user || {};

    const tx: Transaction = {
      id: `tx_${reqId}`,
      type: 'withdrawal',
      amount: -amount,
      network,
      status: 'pending',
      date: new Date().toISOString(),
      hash: reqId,
    };

    set({
      wallet: {
        ...wallet,
        balance: updated.balance !== undefined ? updated.balance : wallet.balance - amount,
        depositBalance: updated.depositBalance !== undefined ? updated.depositBalance : Math.max(0, (wallet.depositBalance || 0) - amount),
        bonusBalance: updated.bonusBalance !== undefined ? updated.bonusBalance : (wallet.bonusBalance || 0),
      },
      allUsers: allUsers.map((u) =>
        u.id === user.id ? { ...u, balance: updated.balance !== undefined ? updated.balance : u.balance - amount } : u
      ),
      withdrawalRequests: [req, ...get().withdrawalRequests],
      transactions: [tx, ...get().transactions],
      bonusClaimed: updated.bonusClaimed !== undefined ? updated.bonusClaimed : get().bonusClaimed,
      lastDepositDate: updated.lastDepositDate !== undefined ? updated.lastDepositDate : get().lastDepositDate,
      lastDepositAmount: updated.lastDepositAmount !== undefined ? updated.lastDepositAmount : get().lastDepositAmount,
    });

    syncTransactionToFirestore(tx);
    return true;
  },

  claimBonus: async () => {
    const { wallet, user, allUsers, bonusClaimed } = get();
    if (bonusClaimed) return false;
    if ((wallet.depositBalance ?? 0) <= 0) return false;

    let res: any;
    try {
      res = await apiPost('/bonus', { action: 'claim' });
    } catch (error: any) {
      throw new Error(error?.message || 'Bonus claim failed');
    }
    if (!res || !res.success) return false;

    const bonusAmount = Number(res.bonus) || 0;
    const bonusTx: Transaction = {
      id: `tx_${Date.now()}`,
      type: 'bonus',
      amount: bonusAmount,
      network: 'BEP20',
      status: 'completed',
      date: new Date().toISOString(),
    };

    set({
      wallet: {
        ...wallet,
        balance: res.balance,
        depositBalance: res.depositBalance,
        bonusBalance: res.bonusBalance !== undefined ? res.bonusBalance : (wallet.bonusBalance || 0) + bonusAmount,
      },
      allUsers: user ? allUsers.map((u) => (u.id === user.id ? { ...u, balance: res.balance } : u)) : allUsers,
      bonusClaimed: true,
      transactions: [bonusTx, ...get().transactions],
    });

    syncTransactionToFirestore(bonusTx);
    return true;
  },

  markNotificationRead: (id: string) => {
    set({
      notifications: get().notifications.map((n) => (n.id === id ? { ...n, read: true } : n)),
    });
    apiPost('/notifications', { id }).catch(() => {});
  },

  markAllRead: () => {
    const ids = get().notifications.filter((n) => !n.read).map((n) => n.id);
    set({
      notifications: get().notifications.map((n) => ({ ...n, read: true })),
    });
    if (ids.length > 0) apiPost('/notifications', { all: true }).catch(() => {});
  },

  loadNotifications: async () => {
    try {
      const list = await apiGet('/notifications');
      if (Array.isArray(list)) set({ notifications: list });
    } catch (e) {
      console.warn('loadNotifications failed:', e);
    }
  },

  addTransaction: (tx) => {
    set({
      transactions: [
        { ...tx, id: `tx_${Date.now()}`, date: new Date().toISOString() },
        ...get().transactions,
      ],
    });
  },

  addNotification: (n) => {
    set({
      notifications: [
        { ...n, id: `notif_${Date.now()}`, date: new Date().toISOString(), read: false },
        ...get().notifications,
      ],
    });
  },

  approveWithdrawal: (id: string, hash?: string) => {
    const req = get().withdrawalRequests.find((r) => r.id === id);
    if (!req) return;
    const txHash = hash || `TX_${Math.random().toString(36).substring(2, 10).toUpperCase()}`;

    const updatedReq: WithdrawalRequest = { ...req, status: 'completed' };

    set({
      withdrawalRequests: get().withdrawalRequests.map((r) =>
        r.id === id ? updatedReq : r
      ),
      transactions: get().transactions.map((t) =>
        t.id === `tx_${id}` || (t.type === 'withdrawal' && t.status === 'pending' && Math.abs(t.amount) === req.amount)
          ? { ...t, status: 'completed', hash: txHash }
          : t
      ),
      notifications: [
        {
          id: `notif_${Date.now()}`,
          title: 'Withdrawal Approved',
          message: `Your withdrawal of ${req.amount} USDT on ${req.network} has been approved and sent! TXID: ${txHash}`,
          read: false,
          date: new Date().toISOString(),
          type: 'success',
        },
        ...get().notifications,
      ],
    });

    syncWithdrawalToFirestore(updatedReq);
    const updatedTx = get().transactions.find((t) => t.id === `tx_${id}`);
    if (updatedTx) {
      syncTransactionToFirestore({ ...updatedTx, status: 'completed', hash: txHash });
    }
  },

  rejectWithdrawal: (id: string, reason?: string) => {
    const req = get().withdrawalRequests.find((r) => r.id === id);
    if (!req) return;

    // Refund is handled server-side (POST /withdrawals status=rejected atomically
    // returns the deducted amount to the user's balance). Local balance stays as-is.

    const updatedReq: WithdrawalRequest = { ...req, status: 'rejected' };

    set({
      withdrawalRequests: get().withdrawalRequests.map((r) =>
        r.id === id ? updatedReq : r
      ),
      transactions: get().transactions.map((t) =>
        t.id === `tx_${id}` || (t.type === 'withdrawal' && t.status === 'pending' && Math.abs(t.amount) === req.amount)
          ? { ...t, status: 'failed' }
          : t
      ),
      notifications: [
        {
          id: `notif_${Date.now()}`,
          title: 'Withdrawal Rejected',
          message: `Withdrawal of ${req.amount} USDT was rejected${reason ? `: ${reason}` : ''}. Funds of ${req.amount} USDT have been refunded to your wallet.`,
          read: false,
          date: new Date().toISOString(),
          type: 'warning',
        },
        ...get().notifications,
      ],
    });

    syncWithdrawalToFirestore(updatedReq);
  },

  approveDeposit: (id: string, hash?: string) => {
    const { depositRequests, allUsers, transactions, user, wallet } = get();
    const req = depositRequests.find((r) => r.id === id);
    if (!req || req.status !== 'pending') return;

    const targetUser = allUsers.find(
      (u) => u.id === req.userId || u.email.toLowerCase() === req.userEmail?.toLowerCase()
    );
    const newBalance = (targetUser?.balance ?? 0) + req.amount;
    const finalHash = hash || req.txHash || `TX_${Date.now()}`;

    const updatedReq: DepositRequest = {
      ...req,
      status: 'completed',
      txHash: finalHash,
      reviewedAt: new Date().toISOString(),
    };

    const updatedRequests = depositRequests.map((r) => (r.id === id ? updatedReq : r));
    const updatedTx = transactions.map((t) =>
      t.id === `tx_${id}` || t.hash === req.txHash
        ? { ...t, status: 'completed' as const, hash: finalHash }
        : t
    );

    const updatedUsers = targetUser
      ? allUsers.map((u) =>
          u.id === targetUser.id
            ? { ...u, balance: newBalance, depositBalance: (u.depositBalance ?? (u.balance ?? 0)) + req.amount }
            : u
        )
      : allUsers;

    const isCurrent = user && targetUser && user.id === targetUser.id;

    set({
      depositRequests: updatedRequests,
      allUsers: updatedUsers,
      transactions: updatedTx,
      ...(isCurrent
        ? {
            wallet: {
              ...wallet,
              balance: newBalance,
              depositBalance: wallet.depositBalance + req.amount,
            },
            lastDepositDate: new Date().toISOString(),
            lastDepositAmount: req.amount,
            bonusClaimed: false,
          }
        : {}),
      notifications: [
        {
          id: `notif_dep_app_${Date.now()}`,
          title: 'Deposit Approved',
          message: `Your deposit of ${req.amount} USDT has been verified and credited to your wallet!`,
          read: false,
          date: new Date().toISOString(),
          type: 'success',
        },
        ...get().notifications,
      ],
    });

    syncDepositToFirestore(updatedReq);
    // IMPORTANT: The server (finalizeDeposit) performs the single authoritative
    // credit (balance + depositBalance atomically with used-hash de-dup). We must
    // NOT write the user balance again from the client — doing that caused the
    // double-credit bug (balance credited twice, depositBalance once) on every
    // admin approval. Only the local optimistic state above is updated.
    const matchingTx = updatedTx.find((t) => t.id === `tx_${id}` || t.hash === req.txHash);
    if (matchingTx) {
      syncTransactionToFirestore(matchingTx);
    }
  },

  rejectDeposit: (id: string, reason?: string) => {
    const { depositRequests, transactions } = get();
    const req = depositRequests.find((r) => r.id === id);
    if (!req || req.status !== 'pending') return;

    const updatedReq: DepositRequest = {
      ...req,
      status: 'rejected',
      rejectReason: reason || 'Transaction hash invalid or unconfirmed on chain',
      reviewedAt: new Date().toISOString(),
    };

    const updatedRequests = depositRequests.map((r) => (r.id === id ? updatedReq : r));
    const updatedTx = transactions.map((t) =>
      t.id === `tx_${id}` || t.hash === req.txHash ? { ...t, status: 'failed' as const } : t
    );

    set({
      depositRequests: updatedRequests,
      transactions: updatedTx,
      notifications: [
        {
          id: `notif_dep_rej_${Date.now()}`,
          title: 'Deposit Rejected',
          message: `Your deposit of ${req.amount} USDT was rejected${reason ? `: ${reason}` : ''}.`,
          read: false,
          date: new Date().toISOString(),
          type: 'warning',
        },
        ...get().notifications,
      ],
    });

    syncDepositToFirestore(updatedReq);
    const matchingTx = updatedTx.find((t) => t.id === `tx_${id}` || t.hash === req.txHash);
    if (matchingTx) {
      syncTransactionToFirestore(matchingTx);
    }
  },

  updateUserBalance: (userId: string, newBalance: number) => {
    const { user, wallet, allUsers } = get();
    const updatedUsers = allUsers.map((u) => (u.id === userId ? { ...u, balance: newBalance } : u));
    set({
      allUsers: updatedUsers,
      ...(user?.id === userId ? { wallet: { ...wallet, balance: newBalance } } : {}),
      notifications: [
        {
          id: `notif_${Date.now()}`,
          title: 'Account Balance Adjusted',
          message: `Your account balance was updated to ${newBalance.toLocaleString('en-US')} USDT by platform administrator.`,
          read: false,
          date: new Date().toISOString(),
          type: 'info',
        },
        ...get().notifications,
      ],
    });
    const targetUser = updatedUsers.find((u) => u.id === userId);
    if (targetUser) {
      syncUserToFirestore(targetUser);
    }
  },

  creditUser: (userId: string, amount: number, note?: string) => {
    const { user, wallet, allUsers, transactions, notifications } = get();
    const target = allUsers.find((u) => u.id === userId);
    if (!target || amount <= 0) return;

    const newBalance = target.balance + amount;
    const isCurrent = user?.id === userId;

    const tx: Transaction = {
      id: `tx_cred_${Date.now()}`,
      type: 'deposit',
      amount: amount,
      network: 'BEP20',
      status: 'completed',
      date: new Date().toISOString(),
      hash: `ADMIN_CREDIT_${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    };

    const notif: Notification = {
      id: `notif_${Date.now()}`,
      title: 'Account Credited',
      message: `${amount.toLocaleString('en-US')} USDT has been credited to your account by administrator${note ? `: ${note}` : ''}.`,
      read: false,
      date: new Date().toISOString(),
      type: 'success',
    };

    const updatedTarget: AdminUserItem = { ...target, balance: newBalance };

    set({
      allUsers: allUsers.map((u) => (u.id === userId ? updatedTarget : u)),
      ...(isCurrent
        ? {
            wallet: {
              ...wallet,
              balance: wallet.balance + amount,
              depositBalance: wallet.depositBalance + amount,
            },
          }
        : {}),
      transactions: [tx, ...transactions],
      notifications: [notif, ...notifications],
    });

    syncUserToFirestore(updatedTarget);
    syncTransactionToFirestore(tx);
  },

  debitUser: (userId: string, amount: number, note?: string) => {
    const { user, wallet, allUsers, transactions, notifications } = get();
    const target = allUsers.find((u) => u.id === userId);
    if (!target || amount <= 0) return;

    const newBalance = Math.max(0, target.balance - amount);
    const actualDeducted = target.balance - newBalance;
    const isCurrent = user?.id === userId;

    const tx: Transaction = {
      id: `tx_deb_${Date.now()}`,
      type: 'withdrawal',
      amount: -actualDeducted,
      network: 'BEP20',
      status: 'completed',
      date: new Date().toISOString(),
      hash: `ADMIN_DEBIT_${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    };

    const notif: Notification = {
      id: `notif_${Date.now()}`,
      title: 'Account Debited',
      message: `${actualDeducted.toLocaleString('en-US')} USDT has been debited from your account by administrator${note ? `: ${note}` : ''}.`,
      read: false,
      date: new Date().toISOString(),
      type: 'warning',
    };

    const updatedTarget: AdminUserItem = { ...target, balance: newBalance };

    set({
      allUsers: allUsers.map((u) => (u.id === userId ? updatedTarget : u)),
      ...(isCurrent
        ? {
            wallet: {
              ...wallet,
              balance: Math.max(0, wallet.balance - actualDeducted),
            },
          }
        : {}),
      transactions: [tx, ...transactions],
      notifications: [notif, ...notifications],
    });

    syncUserToFirestore(updatedTarget);
    syncTransactionToFirestore(tx);
  },

  toggleUserStatus: (userId: string) => {
    const target = get().allUsers.find((u) => u.id === userId);
    if (!target) return;
    const newStatus = target.status === 'active' ? 'blocked' : 'active';
    const updatedTarget: AdminUserItem = { ...target, status: newStatus };

    set({
      allUsers: get().allUsers.map((u) =>
        u.id === userId ? updatedTarget : u
      ),
    });

    syncUserToFirestore(updatedTarget);
  },

  setAllUsers: (users: AdminUserItem[]) => {
    set({ allUsers: users });
    // Also sync logged-in user balance if updated by admin
    const currentUser = get().user;
    if (currentUser) {
      const match = users.find((u) => u.id === currentUser.id);
      if (match) {
        set((state) => ({
          wallet: {
            ...state.wallet,
            balance: match.balance,
          },
          lastDepositDate: match.lastDepositDate ?? state.lastDepositDate,
          lastDepositAmount: match.lastDepositAmount ?? state.lastDepositAmount,
          bonusClaimed: match.bonusClaimed ?? state.bonusClaimed,
        }));
      }
    }
  },

  setWithdrawalRequests: (requests: WithdrawalRequest[]) => {
    set({ withdrawalRequests: requests });
  },

  setDepositRequests: (requests: DepositRequest[]) => {
    set({ depositRequests: requests });
  },

  setTransactions: (transactions: Transaction[]) => {
    set({ transactions });
  },
  }),
  {
    name: 'tetherly-clean-store',
    partialize: (state) => ({
      user: state.user,
      wallet: state.wallet,
      transactions: state.transactions,
      notifications: state.notifications,
      withdrawalRequests: state.withdrawalRequests,
      allUsers: state.allUsers,
      isLoggedIn: state.isLoggedIn,
      lastDepositDate: state.lastDepositDate,
      lastDepositAmount: state.lastDepositAmount,
      bonusClaimed: state.bonusClaimed,
    }),
  }
));
