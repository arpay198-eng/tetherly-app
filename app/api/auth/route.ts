import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { signToken, getAuth } from '@/lib/auth';
import { pushNotification } from '@/lib/notifications';

export const dynamic = 'force-dynamic';

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
      if (!userRecord.password || userRecord.password !== cur) {
        return NextResponse.json({ error: 'Current password is incorrect' }, { status: 401 });
      }

      await userRef.update({ password: next, updatedAt: new Date().toISOString() });

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

    const adminDb = getAdminDb();

    let userRecord: any = null;
    try {
      const em = cleanEmail;
      const snap = await adminDb.collection('users').where('email', '==', em).limit(1).get();
      if (!snap.empty) {
        userRecord = snap.docs[0].data();
      } else {
        const byId = await adminDb.collection('users').doc(cleanEmail).get();
        if (byId.exists) userRecord = byId.data();
      }
    } catch (err) {
      console.error('Auth lookup error:', err);
      return NextResponse.json({ error: 'Server verification unavailable' }, { status: 500 });
    }

    if (!userRecord || !userRecord.password || userRecord.password !== cleanPassword) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    if (userRecord.status === 'blocked') {
      return NextResponse.json({ error: 'Your account has been suspended. Please contact support.' }, { status: 403 });
    }

    const isAdmin = userRecord.role === 'admin' || userRecord.isAdmin === true;
    const token = signToken({ id: userRecord.id, email: userRecord.email, isAdmin });

    // Referral stats (server-computed so the client can never fake earnings).
    const referralCountSnap = await adminDb.collection('users').where('referredBy', '==', String(userRecord.id)).limit(500).get();

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
        referralCount: referralCountSnap.size,
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