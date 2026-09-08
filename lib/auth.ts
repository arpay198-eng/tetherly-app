import { createHmac, timingSafeEqual } from 'node:crypto';

const SECRET = process.env.AUTH_SECRET || 'tetherly-local-dev-secret';

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