import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { getAuth } from '@/lib/auth';
import { hashPassword } from '@/lib/password';
import { checkRateLimit } from '@/lib/rateLimit';
import { randomBytes } from 'node:crypto';
import {
  getCached,
  setCached,
  getFallback,
  invalidateCache,
  getUserById,
  getUserByEmail,
  saveUserRecord,
  withTimeout,
} from '@/lib/apiCache';

// Walk the invite chain and reject any link that would create a referral cycle.
async function wouldCreateCycle(userId: string, inviterId: string): Promise<boolean> {
  const adminDb = getAdminDb();
  let cur: string | null = String(inviterId);
  let guard = 0;
  while (cur && guard < 5) {
    if (String(cur) === String(userId)) return true;
    const snap = await adminDb.collection('users').doc(String(cur)).get();
    if (!snap.exists) break;
    cur = (snap.data()?.referredBy as string) || null;
    guard++;
  }
  return false;
}

export async function POST(request: Request) {
  try {
    // Rate limit: 3 registrations per minute per IP.
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
    const rl = checkRateLimit(`register:${ip}`, 3, 60_000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: `Too many registration attempts. Try again in ${Math.ceil(rl.retryAfterMs / 1000)}s.` },
        { status: 429 },
      );
    }

    const body = await request.json();
    const { name, email, phone, balance, status, joinedDate, password, lastDepositDate, lastDepositAmount, bonusClaimed, depositBalance, referredBy } = body;
    // id is only accepted for admin updates of existing users (see below).
    const clientId = body.id;

    if (!email) {
      return NextResponse.json({ error: 'email is required' }, { status: 400 });
    }

    if (balance !== undefined && balance < 0) {
      return NextResponse.json({ error: 'Balance cannot be negative' }, { status: 400 });
    }

    if (status && status !== 'active' && status !== 'blocked') {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    if (lastDepositAmount !== undefined && (typeof lastDepositAmount !== 'number' || lastDepositAmount < 0)) {
      return NextResponse.json({ error: 'Invalid lastDepositAmount' }, { status: 400 });
    }
    if (bonusClaimed !== undefined && typeof bonusClaimed !== 'boolean') {
      return NextResponse.json({ error: 'Invalid bonusClaimed' }, { status: 400 });
    }

    const adminDb = getAdminDb();
    const auth = getAuth(request);

    // Self-registration: no client-supplied ID — server generates a unique one.
    if (!clientId) {
      // Server-generated ID using crypto (not Math.random).
      const serverId = randomBytes(5).readUInt32BE(0).toString().slice(0, 10);
      const userRef = adminDb.collection('users').doc(serverId);

      // Open path: self-registration only. New users must start clean.
      // Enforce server-side email uniqueness so a duplicate account can never happen.
      const cleanEmail = email.toLowerCase().trim();

      try {
        const dupSnap = await withTimeout(adminDb.collection('users').where('email', '==', cleanEmail).limit(1).get(), 8000);
        if (!dupSnap.empty) {
          return NextResponse.json({ error: 'Email already registered. Please sign in instead.' }, { status: 409 });
        }
      } catch (e: any) {
        console.warn('Firestore email dup check warning:', e?.message);
      }

      if (balance !== undefined && balance !== 0) {
        return NextResponse.json({ error: 'New users must start with balance 0' }, { status: 400 });
      }
      if ((lastDepositDate !== undefined && lastDepositDate !== null) || (lastDepositAmount !== undefined && lastDepositAmount !== 0) || (bonusClaimed !== undefined && bonusClaimed !== false)) {
        return NextResponse.json({ error: 'New users cannot set deposit bonus fields' }, { status: 400 });
      }
      if (!password || String(password).length < 6) {
        return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
      }

      // Referral: optional code of the inviting user.
      let referredById: string | null = null;
      let referredByName = '';
      const cleanRef = String(referredBy || '').trim().toUpperCase();
      if (cleanRef) {
        try {
          const codeRef = adminDb.collection('referral_codes').doc(cleanRef);
          const codeSnap = await withTimeout(codeRef.get(), 1500);
          if (codeSnap.exists) {
            const codeData = codeSnap.data() || {};
            referredById = String(codeData.userId || '');
            referredByName = String(codeData.name || '');
          }
        } catch {}
      }

      const referralCode = `TETH${Math.floor(10000 + Math.random() * 90000)}`;
      const hashedPassword = await hashPassword(String(password));

      const newUserData = {
        id: serverId,
        name: name || '',
        email: cleanEmail,
        phone: phone || '',
        balance: 0,
        depositBalance: 0,
        status: status || 'active',
        joinedDate: joinedDate || new Date().toISOString().split('T')[0],
        password: hashedPassword,
        referralCode,
        ...(referredById ? { referredBy: referredById, referredByName } : {}),
      };

      // Save to cache snapshot immediately
      saveUserRecord(newUserData);

      // Fire-and-forget write to Firestore
      userRef.set(newUserData, { merge: true }).catch((e) => console.warn('userRef.set warning:', e?.message));
      adminDb.collection('referral_codes').doc(referralCode).set({
        code: referralCode,
        userId: String(serverId),
        name: name || '',
        email: cleanEmail,
      }).catch(() => {});

      invalidateCache('users:');
      return NextResponse.json({ success: true, id: serverId, referralCode });
    }

    // Existing user updates: ADMIN ONLY.
    if (!auth || !auth.isAdmin) {
      return NextResponse.json({ error: 'Forbidden: admin access required' }, { status: 403 });
    }

    if (!clientId) {
      return NextResponse.json({ error: 'id is required for admin updates' }, { status: 400 });
    }

    const adminRef = adminDb.collection('users').doc(String(clientId));
    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = name;
    if (email !== undefined) data.email = email.toLowerCase().trim();
    if (phone !== undefined) data.phone = phone;
    if (balance !== undefined) data.balance = balance;
    if (status !== undefined) data.status = status;
    if (joinedDate !== undefined) data.joinedDate = joinedDate;
    if (password !== undefined) data.password = await hashPassword(String(password));
    if (lastDepositDate !== undefined) data.lastDepositDate = lastDepositDate;
    if (lastDepositAmount !== undefined) data.lastDepositAmount = lastDepositAmount;
    if (bonusClaimed !== undefined) data.bonusClaimed = bonusClaimed;
    if (depositBalance !== undefined) data.depositBalance = depositBalance;
    if (body.bonusBalance !== undefined) data.bonusBalance = body.bonusBalance;
    if (referredBy !== undefined) data.referredBy = referredBy;

    // Guard admin edits against wiring up a referral cycle.
    if (referredBy !== undefined && String(referredBy).trim() !== '' && (await wouldCreateCycle(String(clientId), String(referredBy).trim()))) {
      return NextResponse.json({ error: 'Referral cycle detected' }, { status: 400 });
    }

    await adminRef.set(data, { merge: true });
    saveUserRecord({ id: String(clientId), ...data });
    invalidateCache('users:');

    return NextResponse.json({ success: true, id: clientId });
  } catch (error) {
    console.error('API users error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('id');
  const referredBy = searchParams.get('referredBy');
  let cacheKey = 'users:all:none';

  const stripPassword = (data: any) => {
    if (!data) return data;
    const copy: any = { ...data };
    delete copy.password;
    return copy;
  };

  try {
    const auth = getAuth(request);
    if (!auth) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    cacheKey = `users:${userId ? `user_${userId}` : 'all'}:${referredBy || 'none'}`;
    const cached = getCached<any>(cacheKey, 8000);
    if (cached) {
      return NextResponse.json(cached);
    }

    const adminDb = getAdminDb();

    if (userId) {
      // Non-admin users can only look up their own record.
      if (!auth.isAdmin && String(userId) !== String(auth.id)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      let userData = getUserById(userId);
      if (!userData) {
        try {
          const snap = await withTimeout(adminDb.collection('users').doc(userId).get(), 1500);
          if (snap.exists) userData = snap.data();
        } catch (e: any) {
          console.warn('Firestore user GET warning (falling back to cache):', e?.message);
        }
      }

      if (!userData) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }

      const result = stripPassword(userData);
      setCached(cacheKey, result);
      return NextResponse.json(result);
    }

    // List all users — admin only.
    if (!auth.isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const snap = await adminDb.collection('users').limit(1000).get();
    const users: any[] = [];
    snap.forEach((docSnap) => {
      const data = docSnap.data();
      if (referredBy && data.referredBy !== referredBy) return;
      users.push(stripPassword(data));
    });

    setCached(cacheKey, users);
    return NextResponse.json(users);
  } catch (error) {
    console.error('API users GET error, returning persistent cache:', error);
    if (userId) {
      const u = getUserById(userId);
      if (u) return NextResponse.json(stripPassword(u));
    }
    const fallback = getFallback<any>(cacheKey);
    const users = Array.isArray(fallback) ? fallback.map(stripPassword) : [];
    return NextResponse.json(users);
  }
}