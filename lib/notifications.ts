import { getAdminDb } from './firebaseAdmin';

// Server-side persistent notification. Fire-and-forget: never fails the caller.
export async function pushNotification(
  userId: string,
  title: string,
  message: string,
  type: 'info' | 'success' | 'warning' = 'info'
) {
  try {
    const adminDb = getAdminDb();
    const id = `notif_${userId}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    await adminDb.collection('notifications').doc(id).set({
      id,
      userId,
      title,
      message,
      type,
      read: false,
      date: new Date().toISOString(),
    });
  } catch (e: any) {
    console.error('pushNotification error:', e?.message || e);
  }
}