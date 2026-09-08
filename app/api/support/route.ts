import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';
import { getAuth } from '@/lib/auth';
import { pushNotification } from '@/lib/notifications';

export const dynamic = 'force-dynamic';

type TicketStatus = 'open' | 'resolved' | 'closed';
type Reply = { id: string; from: 'user' | 'admin'; message: string; date: string };

const VALID_STATUSES: TicketStatus[] = ['open', 'resolved', 'closed'];

function cleanText(value: unknown, maxLen: number): string {
  return String(value || '').trim().slice(0, maxLen);
}

function buildReply(message: string, from: 'user' | 'admin'): Reply {
  return {
    id: `reply_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    from,
    message: message.slice(0, 2000),
    date: new Date().toISOString(),
  };
}

export async function GET(request: Request) {
  try {
    const auth = getAuth(request);
    if (!auth) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const adminDb = getAdminDb();
    const snap = await adminDb.collection('support_tickets').orderBy('updatedAt', 'desc').limit(300).get();

    const list: any[] = [];
    snap.forEach((d) => {
      const data = d.data() || {};
      if (!auth.isAdmin && String(data.userId || '') !== String(auth.id)) return;
      list.push(data);
    });

    return NextResponse.json(list);
  } catch (error) {
    console.error('API support GET error:', error);
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
    const action = body?.action;
    const adminDb = getAdminDb();

    // ---- Create ticket (any authenticated user) ----
    if (action === 'create') {
      const subject = cleanText(body?.subject, 120);
      const message = cleanText(body?.message, 3000);
      if (!subject || !message) {
        return NextResponse.json({ error: 'Subject and message are required' }, { status: 400 });
      }

      const userRef = adminDb.collection('users').doc(String(auth.id));
      const userSnap = await userRef.get();
      const userData = userSnap.exists ? (userSnap.data() || {}) : {};
      const userName = String(userData.name || userData.email || auth.email || 'User').slice(0, 100);

      const id = `tkt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const now = new Date().toISOString();
      const ticket = {
        id,
        userId: String(auth.id),
        userName,
        userEmail: auth.email,
        subject,
        message,
        status: 'open' as TicketStatus,
        createdAt: now,
        updatedAt: now,
        replies: [] as Reply[],
      };

      await adminDb.collection('support_tickets').doc(id).set(ticket);
      return NextResponse.json({ success: true, id, ticket });
    }

    // ---- Reply to ticket (owner or admin) ----
    if (action === 'reply') {
      const id = String(body?.id || '');
      const message = cleanText(body?.message, 2000);
      if (!id || !message) {
        return NextResponse.json({ error: 'Ticket id and message are required' }, { status: 400 });
      }

      const ticketRef = adminDb.collection('support_tickets').doc(id);
      const snap = await ticketRef.get();
      if (!snap.exists) {
        return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
      }

      const data = snap.data() || {};
      const isOwner = String(data.userId || '') === String(auth.id);
      if (!isOwner && !auth.isAdmin) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      const existingReplies: Reply[] = Array.isArray(data.replies) ? data.replies : [];
      const reply = buildReply(message, auth.isAdmin ? 'admin' : 'user');

      // A user replying to a resolved/closed ticket reopens it.
      let nextStatus: TicketStatus = data.status === 'open' ? 'open' : 'open';

      const updates: Record<string, unknown> = {
        replies: [...existingReplies, reply],
        updatedAt: new Date().toISOString(),
        status: nextStatus,
      };

      await ticketRef.update(updates);

      // Notify the ticket owner when support (admin) replies.
      if (auth.isAdmin) {
        pushNotification(String(data.userId), 'Support replied', `Your ticket "#${id}" has a new reply from support.`, 'success');
      }

      return NextResponse.json({ success: true, reply, status: updates.status });
    }

    // ---- Change status (admin only) ----
    if (action === 'status') {
      if (!auth.isAdmin) {
        return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
      }

      const id = String(body?.id || '');
      const status = String(body?.status || '');
      if (!id || !VALID_STATUSES.includes(status as TicketStatus)) {
        return NextResponse.json({ error: 'Valid ticket id and status required' }, { status: 400 });
      }

      const ticketRef = adminDb.collection('support_tickets').doc(id);
      const snap = await ticketRef.get();
      if (!snap.exists) {
        return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
      }

      await ticketRef.update({ status, updatedAt: new Date().toISOString() });

      if (status === 'resolved') {
        const data = snap.data() || {};
        pushNotification(String(data.userId), 'Ticket resolved', `Your ticket "#${id}" has been marked as resolved.`, 'success');
      } else if (status === 'closed') {
        const data = snap.data() || {};
        pushNotification(String(data.userId), 'Ticket closed', `Your ticket "#${id}" has been closed.`, 'info');
      }

      return NextResponse.json({ success: true, id, status });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error('API support POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}