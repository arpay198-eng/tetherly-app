const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');
const sa = JSON.parse(fs.readFileSync('C:\\Users\\rohim\\Downloads\\arwalletp2p-firebase-adminsdk-fbsvc-42c5ef15f1.json', 'utf8'));
const app = getApps().length === 0 ? initializeApp({ credential: cert(sa), projectId: sa.project_id }) : getApps()[0];
const db = getFirestore(app);
async function main() {
  const userId = process.argv[2] || '1693561668';
  await db.collection('users').doc(userId).update({
    lastDepositDate: '2026-09-01T00:00:00.000Z',
    lastDepositAmount: 0,
  });
  const snap = await db.collection('users').doc(userId).get();
  const d = snap.data();
  console.log(JSON.stringify({ ok: true, balance: d.balance, lastDepositDate: d.lastDepositDate }));
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
