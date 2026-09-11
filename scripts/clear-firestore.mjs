import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as fs from 'fs';

const sa = JSON.parse(fs.readFileSync('C:\\Users\\rohim\\Downloads\\arwalletp2p-firebase-adminsdk-fbsvc-42c5ef15f1.json', 'utf8'));

const app = getApps().length === 0
  ? initializeApp({ credential: cert(sa), projectId: sa.project_id })
  : getApps()[0];

const db = getFirestore(app);

async function clearCollection(name: string) {
  const snap = await db.collection(name).limit(500).get();
  if (snap.empty) { console.log(`  ${name}: already empty`); return; }
  const batch = db.batch();
  snap.docs.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();
  console.log(`  ${name}: deleted ${snap.size} docs`);
}

async function main() {
  const collections = ['users', 'transactions', 'deposits', 'withdrawals', 'notifications', 'referral_codes', 'support_tickets'];
  for (const col of collections) {
    await clearCollection(col);
  }
  console.log('Done!');
}

main().catch(console.error);
