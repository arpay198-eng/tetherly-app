import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { getAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const auth = getAuth(request);
    if (!auth) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const adminDb = getAdminDb();
    const { searchParams } = new URL(request.url);
    const targetId = searchParams.get('userId') || auth.id;

    // Non-admins can only read their own notifications.
    if (String(targetId) !== String(auth.id) && !auth.isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Single-field orderBy only (auto-indexed), then in-memory userId filter to
    // avoid a composite index.
    const snap = await adminDb.collection('notifications').orderBy('date', 'desc').limit(100).get();
    const list: any[] = [];
    snap.forEach((d) => {
      const data = d.data() || {};
      if (String(data.userId || '') !== String(targetId)) return;
      list.push(data);
    });
    return NextResponse.json(list);
  } catch (error) {
    console.error('API notifications error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = getAuth(request);
    if (!auth) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const body = await request.json();
    const { id, all } = body || {};

    const adminDb = getAdminDb();

    // Admin push: send a notification to any user by userId.
    if (body && body.userId && body.title) {
      if (!auth.isAdmin) {
        return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
      }
      const userId = String(body.userId).trim();
      const title = String(body.title || '').trim().slice(0, 120);
      const message = String(body.message || '').trim().slice(0, 500);
      const type = ['info', 'success', 'warning'].includes(String(body.type || '')) ? body.type : 'info';
      if (!userId || !title) {
        return NextResponse.json({ error: 'userId and title are required' }, { status: 400 });
      }

      const userRef = adminDb.collection('users').doc(userId);
      const userSnap = await userRef.get();
      if (!userSnap.exists) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }

      const notifId = `notif_${userId}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      await adminDb.collection('notifications').doc(notifId).set({
        id: notifId,
        userId,
        title,
        message,
        type,
        read: false,
        date: new Date().toISOString(),
      });
      return NextResponse.json({ success: true, id: notifId, userId, title });
    }

    if (all) {
      const snap = await adminDb.collection('notifications').orderBy('date', 'desc').limit(100).get();
      const batch = adminDb.batch();
      let ops = 0;
      snap.forEach((d) => {
        const data = d.data() || {};
        if (String(data.userId || '') !== String(auth.id)) return;
        if (data.read) return;
        batch.update(d.ref, { read: true });
        ops++;
      });
      if (ops > 0) await batch.commit();
      return NextResponse.json({ success: true, marked: ops });
    }

    if (!id) {
      return NextResponse.json({ error: 'notification id is required' }, { status: 400 });
    }

    const notifRef = adminDb.collection('notifications').doc(String(id));
    const snap = await notifRef.get();
    if (!snap.exists) {
      return NextResponse.json({ error: 'Notification not found' }, { status: 404 });
    }
    const data = snap.data() || {};
    if (String(data.userId || '') !== String(auth.id) && !auth.isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    await notifRef.update({ read: true });
    return NextResponse.json({ success: true, id });
  } catch (error) {
    console.error('API notifications error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}