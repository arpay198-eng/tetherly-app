const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');

const sa = JSON.parse(fs.readFileSync('C:\\Users\\rohim\\Downloads\\arwalletp2p-firebase-adminsdk-fbsvc-42c5ef15f1.json', 'utf8'));

const app = getApps().length === 0
  ? initializeApp({ credential: cert(sa), projectId: sa.project_id })
  : getApps()[0];

const db = getFirestore(app);

async function clearCollection(name) {
  let total = 0;
  let snap;
  do {
    snap = await db.collection(name).limit(500).get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    total += snap.size;
    console.log(`  ${name}: deleted ${snap.size} (total: ${total})`);
  } while (!snap.empty);
  if (total === 0) console.log(`  ${name}: already empty`);
}

async function main() {
  const collections = ['users', 'transactions', 'deposits', 'withdrawals', 'notifications', 'referral_codes', 'support_tickets'];
  for (const col of collections) {
    await clearCollection(col);
  }
  console.log('Done!');
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
