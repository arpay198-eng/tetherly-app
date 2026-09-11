'use client';

import { useEffect } from 'react';
import { useStore } from '@/store/useStore';
import {
  listenToUsers,
  listenToWithdrawals,
  listenToDeposits,
  listenToTransactions,
  seedFirestoreIfEmpty,
} from '@/lib/firebaseService';

export default function FirebaseSync() {
  const {
    allUsers,
    withdrawalRequests,
    depositRequests,
    transactions,
    setAllUsers,
    setWithdrawalRequests,
    setDepositRequests,
    setTransactions,
    user,
    refreshUser,
  } = useStore();

  useEffect(() => {
    // Purge any legacy fake transactions or fake balances from localStorage
    try {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('tetherly-store');
      }
    } catch {}

    const st = useStore.getState();
    const transactionsList = st?.transactions || [];
    const hasLegacyFakeTx = transactionsList.some((t) => t?.id?.includes('2817782317') || t?.id?.includes('tx_init'));
    const isOldAdminUser = st?.user?.email === 'admin@tetherly.com';
    const currentBal = st?.wallet?.balance;
    const isOldBalance = currentBal === 20500 || currentBal === 18000;
    if (hasLegacyFakeTx || isOldBalance || isOldAdminUser) {
      useStore.setState({
        wallet: { balance: 0, depositBalance: 0, bonusBalance: 0 },
        transactions: [],
        notifications: [],
        lastDepositDate: null,
        lastDepositAmount: 0,
        bonusClaimed: false,
        ...(isOldAdminUser ? { user: null, isLoggedIn: false } : {}),
      });
    }

    // Only the admin needs real-time subscriptions to ALL collections.
    // Normal users get their own data via server-filtered API calls — this
    // prevents one user's data from leaking into another user's store.
    if (!user?.isAdmin) return;

    // Seed Firestore with initial data if collections are currently empty
    seedFirestoreIfEmpty();

    // Subscribe to real-time changes (admin only)
    const unsubUsers = listenToUsers((users) => {
      if (users && users.length > 0) {
        setAllUsers(users);
      }
    });

    const unsubWithdrawals = listenToWithdrawals((requests) => {
      if (requests && requests.length > 0) {
        setWithdrawalRequests(requests);
      }
    });

    const unsubDeposits = listenToDeposits((requests) => {
      if (requests) {
        setDepositRequests(requests);
      }
    });

    const unsubTransactions = listenToTransactions((txs) => {
      if (txs && txs.length > 0) {
        setTransactions(txs);
      }
    });

    return () => {
      unsubUsers();
      unsubWithdrawals();
      unsubDeposits();
      unsubTransactions();
    };
  }, [user?.isAdmin]);

  // Live Server Polling for Regular Users:
  // Keeps normal users' balance, status, notifications, and transactions up to date
  // from the server every 5s without exposing full Firestore collections to client.
  useEffect(() => {
    if (!user || user.isAdmin) return;
    let alive = true;

    const sync = async () => {
      if (!alive) return;
      await refreshUser();
    };

    void sync();
    const interval = setInterval(sync, 15000);

    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, [user?.id, user?.isAdmin, refreshUser]);

  return null;
}
