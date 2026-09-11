import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';

// Require AUTH_SECRET in production. Fall back to a random per-instance secret
// so tokens can never be forged using a known hardcoded value.
const SECRET = process.env.AUTH_SECRET || randomBytes(32).toString('hex');

export interface AuthPayload {
  id: string;
  email: string;
  isAdmin: boolean;
  exp: number;
}

export function signToken(payload: { id: string; email: string; isAdmin: boolean }): string {
  const exp = Date.now() + 12 * 60 * 60 * 1000;
  const data = `${payload.id}|${payload.email}|${payload.isAdmin}|${exp}`;
  const sig = createHmac('sha256', SECRET).update(data).digest('hex');
  return Buffer.from(`${data}|${sig}`).toString('base64url');
}

export function verifyToken(token?: string | null): AuthPayload | null {
  if (!token) return null;
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf8');
    const parts = decoded.split('|');
    if (parts.length !== 5) return null;
    const [id, email, isAdminRaw, exp, sig] = parts;
    const data = `${id}|${email}|${isAdminRaw}|${exp}`;
    const expected = createHmac('sha256', SECRET).update(data).digest('hex');
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const expNum = Number(exp);
    if (!expNum || Date.now() >= expNum) return null;
    // Sanitize: ensure id and email are non-empty strings
    if (!id || !email) return null;
    return { id, email, isAdmin: isAdminRaw === 'true', exp: expNum };
  } catch {
    return null;
  }
}

export function getAuth(request: Request): AuthPayload | null {
  const header = request.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : header;
  return verifyToken(token);
}

// Server-side: verify user actually exists in Firestore and is not blocked.
// Prevents forged tokens from granting access after account deletion/block.
export async function getVerifiedAuth(request: Request): Promise<AuthPayload | null> {
  const auth = getAuth(request);
  if (!auth) return null;
  try {
    const { getAdminDb } = await import('./firebaseAdmin');
    const adminDb = getAdminDb();
    const userSnap = await adminDb.collection('users').doc(auth.id).get();
    if (!userSnap.exists) return null;
    const userData = userSnap.data()!;
    if (userData.status === 'blocked') return null;
    // If token isAdmin but DB is not, downgrade
    if (auth.isAdmin && !userData.isAdmin) {
      return { ...auth, isAdmin: false };
    }
    return auth;
  } catch {
    return auth; // Fallback: trust token if Firestore unreachable
  }
}