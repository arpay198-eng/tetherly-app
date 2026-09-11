import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdmin';

export async function GET() {
  try {
    const adminDb = getAdminDb();
    const snap = await adminDb.collection('users').limit(1).get();
    return NextResponse.json({ ok: true, userCount: snap.size, hasSA: !!process.env.FIREBASE_SERVICE_ACCOUNT });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message, hasSA: !!process.env.FIREBASE_SERVICE_ACCOUNT });
  }
}
