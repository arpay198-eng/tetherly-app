import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { getAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

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
    const body = await request.json();
    const { id, name, email, phone, balance, status, joinedDate, password, lastDepositDate, lastDepositAmount, bonusClaimed, depositBalance, referredBy } = body;

    if (!id || !email) {
      return NextResponse.json({ error: 'id and email are required' }, { status: 400 });
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
    const userRef = adminDb.collection('users').doc(String(id));
    const existing = await userRef.get();
    const auth = getAuth(request);

    if (!existing.exists) {
      // Open path: self-registration only. New users must start clean.
      // Enforce server-side email uniqueness so a duplicate account (and the
      // "registered but told it failed" confusion) can never happen.
      const cleanEmail = email.toLowerCase().trim();
      const dupSnap = await adminDb.collection('users').where('email', '==', cleanEmail).limit(1).get();
      if (!dupSnap.empty) {
        return NextResponse.json({ error: 'Email already registered. Please sign in instead.' }, { status: 409 });
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

      // Referral: optional code of the inviting user. Server-side resolution via
      // the referral_codes index (client can never forge a referral relationship).
      let referredById: string | null = null;
      let referredByName = '';
      const cleanRef = String(referredBy || '').trim().toUpperCase();
      if (cleanRef) {
        const codeRef = adminDb.collection('referral_codes').doc(cleanRef);
        const codeSnap = await codeRef.get();
        if (!codeSnap.exists) {
          return NextResponse.json({ error: `Invalid referral code "${cleanRef}"` }, { status: 400 });
        }
        const codeData = codeSnap.data() || {};
        if (codeData.userId === id) {
          return NextResponse.json({ error: 'You cannot use your own referral code' }, { status: 400 });
        }
        referredById = String(codeData.userId || '');
        referredByName = String(codeData.name || '');
      }

      if (referredById && (await wouldCreateCycle(String(id), referredById))) {
        return NextResponse.json({ error: 'Referral cycle detected: an ancestor already invited you' }, { status: 400 });
      }

      // Generate a unique referral code and index it so future registrations
      // can resolve it server-side with a single document look-up.
      let referralCode = '';
      for (let attempt = 0; attempt < 5; attempt++) {
        referralCode = `TETH${Math.floor(10000 + Math.random() * 90000)}`;
        const exists = await adminDb.collection('referral_codes').doc(referralCode).get();
        if (!exists.exists) break;
      }

      await userRef.set({
        id,
        name: name || '',
        email: email.toLowerCase().trim(),
        phone: phone || '',
        balance: balance || 0,
        status: status || 'active',
        joinedDate: joinedDate || new Date().toISOString().split('T')[0],
        password,
        referralCode,
        ...(referredById ? { referredBy: referredById, referredByName } : {}),
      }, { merge: true });
      await adminDb.collection('referral_codes').doc(referralCode).set({
        code: referralCode,
        userId: String(id),
        name: name || '',
        email: email.toLowerCase().trim(),
      });

      return NextResponse.json({ success: true, id, referralCode });
    }

    // Existing user updates: ADMIN ONLY.
    if (!auth || !auth.isAdmin) {
      return NextResponse.json({ error: 'Forbidden: admin access required' }, { status: 403 });
    }

    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = name;
    if (email !== undefined) data.email = email.toLowerCase().trim();
    if (phone !== undefined) data.phone = phone;
    if (balance !== undefined) data.balance = balance;
    if (status !== undefined) data.status = status;
    if (joinedDate !== undefined) data.joinedDate = joinedDate;
    if (password !== undefined) data.password = password;
    if (lastDepositDate !== undefined) data.lastDepositDate = lastDepositDate;
    if (lastDepositAmount !== undefined) data.lastDepositAmount = lastDepositAmount;
    if (bonusClaimed !== undefined) data.bonusClaimed = bonusClaimed;
    if (depositBalance !== undefined) data.depositBalance = depositBalance;
    if (referredBy !== undefined) data.referredBy = referredBy;

    // Guard admin edits against wiring up a referral cycle.
    if (referredBy !== undefined && String(referredBy).trim() !== '' && (await wouldCreateCycle(String(id), String(referredBy).trim()))) {
      return NextResponse.json({ error: 'Referral cycle detected' }, { status: 400 });
    }

    await userRef.set(data, { merge: true });

    return NextResponse.json({ success: true, id });
  } catch (error) {
    console.error('API users error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('id');
    const referredBy = searchParams.get('referredBy');
    const adminDb = getAdminDb();

    const stripPassword = (data: any) => {
      const copy: any = { ...data };
      delete copy.password;
      return copy;
    };

    if (userId) {
      const snap = await adminDb.collection('users').doc(userId).get();
      if (!snap.exists) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }
      return NextResponse.json(stripPassword(snap.data()));
    }

    const snap = await adminDb.collection('users').limit(1000).get();
    const users: any[] = [];
    snap.forEach((docSnap) => {
      const data = docSnap.data();
      if (referredBy && data.referredBy !== referredBy) return;
      users.push(stripPassword(data));
    });
    return NextResponse.json(users);
  } catch (error) {
    console.error('API users GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}