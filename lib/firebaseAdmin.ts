import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import * as fs from 'fs';
import * as path from 'path';

let cachedDb: Firestore | null = null;

function resolveCredentials(): { projectId: string; credential: any } | null {
  const candidates = [
    process.env.FIREBASE_SERVICE_ACCOUNT, // raw JSON string
    process.env.GOOGLE_APPLICATION_CREDENTIALS, // file path
    path.join(process.cwd(), 'firebase-service-account.json'),
  ];

  // 1. Inline JSON env
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      const cred = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      return { projectId: cred.project_id || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'tetherly-usdt', credential: cert(cred) };
    } catch (err) {
      console.error('[firebaseAdmin] Invalid FIREBASE_SERVICE_ACCOUNT JSON:', err);
    }
  }

  // 2. Explicit path env
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS && fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
    try {
      const cred = JSON.parse(fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8'));
      return { projectId: cred.project_id || 'tetherly-usdt', credential: cert(cred) };
    } catch (err) {
      console.error('[firebaseAdmin] Invalid GOOGLE_APPLICATION_CREDENTIALS:', err);
    }
  }

  // 3. Well-known project file
  for (const candidate of [candidates[2]]) {
    if (candidate && fs.existsSync(candidate)) {
      try {
        const cred = JSON.parse(fs.readFileSync(candidate, 'utf8'));
        return { projectId: cred.project_id || 'tetherly-usdt', credential: cert(cred) };
      } catch (err) {
        console.error('[firebaseAdmin] Invalid firebase-service-account.json:', err);
      }
    }
  }

  return null;
}

/**
 * Admin SDK database. Server-only operation: bypasses Firestore Security Rules,
 * so financial mutations are safe even though the public web API keys ship to
 * the client bundle. Callers should ALWAYS treat this as fully trusted.
 */
export function getAdminDb(): Firestore {
  if (cachedDb) return cachedDb;
  const resolved = resolveCredentials();
  if (!resolved) {
    throw new Error('Firebase service account credentials not found. Place firebase-service-account.json in the project root.');
  }

  const existing = getApps().find((a) => a.name === '[DEFAULT]');
  const adminApp = existing || initializeApp({
    credential: resolved.credential,
    projectId: resolved.projectId,
  });

  cachedDb = getFirestore(adminApp);
  return cachedDb;
}