import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { signToken, getAuth } from '@/lib/auth';
import { pushNotification } from '@/lib/notifications';
import { verifyPassword } from '@/lib/password';
import { checkRateLimit } from '@/lib/rateLimit';
import { getUserByEmail, getUserById, saveUserRecord, withTimeout } from '@/lib/apiCache';

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (body?.action === 'changePassword') {
      const auth = getAuth(request);
      if (!auth) {
        return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
      }
      const { currentPassword, newPassword } = body || {};
      const cur = String(currentPassword || '');
      const next = String(newPassword || '');
      if (!cur || !next) {
        return NextResponse.json({ error: 'Current and new password are required' }, { status: 400 });
      }
      if (next.length < 6) {
        return NextResponse.json({ error: 'New password must be at least 6 characters' }, { status: 400 });
      }
      if (next === cur) {
        return NextResponse.json({ error: 'New password must be different from the current password' }, { status: 400 });
      }

      const adminDb = getAdminDb();
      const userRef = adminDb.collection('users').doc(String(auth.id));
      const userSnap = await userRef.get();
      if (!userSnap.exists) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }
      const userRecord = userSnap.data()!;
      if (!userRecord.password || !(await verifyPassword(cur, userRecord.password))) {
        return NextResponse.json({ error: 'Current password is incorrect' }, { status: 401 });
      }

      const { hashPassword } = await import('@/lib/password');
      await userRef.update({ password: await hashPassword(next), updatedAt: new Date().toISOString() });

      // Rotate token so only the new password session stays valid.
      const isAdmin = userRecord.role === 'admin' || userRecord.isAdmin === true;
      const token = signToken({ id: userRecord.id, email: userRecord.email, isAdmin });
      await pushNotification(
        String(userRecord.id),
        'Password changed',
        'Your account password was updated successfully.',
        'success'
      );

      return NextResponse.json({
        success: true,
        token,
        user: {
          id: userRecord.id,
          name: userRecord.name || '',
          email: userRecord.email || '',
          phone: userRecord.phone || '',
          role: isAdmin ? 'admin' : 'user',
          isAdmin,
        },
      });
    }

    const { email, password } = body || {};

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const cleanPassword = String(password).trim();

    // Rate limit: 5 login attempts per minute per email. Stricter for admin: 3 per minute.
    const isAdminEmail = cleanEmail === 'rohim.badsha198@gmail.com';
    const maxAttempts = isAdminEmail ? 3 : 5;
    const rl = checkRateLimit(`login:${cleanEmail}`, maxAttempts, 60_000);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: `Too many login attempts. Try again in ${Math.ceil(rl.retryAfterMs / 1000)}s.` },
        { status: 429 },
      );
    }

    const adminDb = getAdminDb();

    let userRecord: any = null;
    try {
      const em = cleanEmail;
      const snap = await withTimeout(adminDb.collection('users').where('email', '==', em).limit(1).get(), 8000);
      if (!snap.empty) {
        userRecord = snap.docs[0].data();
        saveUserRecord(userRecord);
      }
    } catch (err: any) {
      console.warn('Auth Firestore lookup error:', err?.message);
      // Fallback to cache only if Firestore fails
      userRecord = getUserByEmail(cleanEmail);
    }

    if (!userRecord || !userRecord.password) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    // Support both hashed (bcrypt) and legacy plaintext passwords.
    // On successful plaintext match, migrate to hash automatically.
    let passwordValid = false;
    if (await verifyPassword(cleanPassword, userRecord.password)) {
      passwordValid = true;
    } else if (userRecord.password === cleanPassword) {
      // Legacy plaintext match — migrate to hash immediately.
      passwordValid = true;
      try {
        const { hashPassword } = await import('@/lib/password');
        const userRef = adminDb.collection('users').doc(String(userRecord.id));
        await userRef.update({ password: await hashPassword(cleanPassword) });
      } catch {}
    }

    if (!passwordValid) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    if (userRecord.status === 'blocked') {
      return NextResponse.json({ error: 'Your account has been suspended. Please contact support.' }, { status: 403 });
    }

    const isAdmin = userRecord.role === 'admin' || userRecord.isAdmin === true;
    const token = signToken({ id: userRecord.id, email: userRecord.email, isAdmin });

    // Referral stats (server-computed so the client can never fake earnings).
    let referralCount = 0;
    try {
      const referralCountSnap = await adminDb.collection('users').where('referredBy', '==', String(userRecord.id)).limit(500).get();
      referralCount = referralCountSnap.size;
    } catch (rErr) {
      console.warn('Referral count lookup skipped (quota or index):', rErr);
    }

    return NextResponse.json({
      token,
      user: {
        id: userRecord.id,
        name: userRecord.name || '',
        email: userRecord.email || '',
        phone: userRecord.phone || '',
        status: userRecord.status || 'active',
        role: isAdmin ? 'admin' : 'user',
        isAdmin,
        joinedDate: userRecord.joinedDate || '',
        balance: Number(userRecord.balance) || 0,
        depositBalance: userRecord.depositBalance !== undefined ? Number(userRecord.depositBalance) : Number(userRecord.balance) || 0,
        bonusBalance: Number(userRecord.bonusBalance) || 0,
        lastDepositDate: userRecord.lastDepositDate || null,
        lastDepositAmount: Number(userRecord.lastDepositAmount) || 0,
        bonusClaimed: !!userRecord.bonusClaimed,
        referralCode: userRecord.referralCode || `TETH${String(userRecord.id).slice(-4).toUpperCase()}`,
        referredBy: userRecord.referredBy || null,
        referredByName: userRecord.referredByName || null,
        referralCount,
        referralEarned: Number(userRecord.referralEarned) || 0,
        referralEarnedLevel2: Number(userRecord.referralEarnedLevel2) || 0,
        dailyBonusPaidOn: userRecord.dailyBonusPaidOn || null,
      },
    });
  } catch (error) {
    console.error('API auth error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}