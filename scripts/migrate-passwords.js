/**
 * One-time script to migrate all plaintext passwords to bcrypt hashes.
 * Run: node scripts/migrate-passwords.js
 */
const admin = require('firebase-admin');
const bcrypt = require('bcryptjs');

const SALT_ROUNDS = 10;

// Load service account from env or file
let serviceAccount;
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
} else {
  serviceAccount = require('../firebase-service-account.json');
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: serviceAccount.project_id || 'tetherly-usdt',
});

const db = admin.firestore();

async function migrate() {
  const usersRef = db.collection('users');
  const snapshot = await usersRef.get();
  
  let migrated = 0;
  let skipped = 0;
  let errors = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const password = data.password;

    if (!password) {
      skipped++;
      continue;
    }

    // Check if already hashed (bcrypt starts with $2a$, $2b$, or $2y$)
    if (/^\$2[aby]\$/.test(password)) {
      skipped++;
      continue;
    }

    // Plaintext — hash it
    try {
      const hashed = await bcrypt.hash(password, SALT_ROUNDS);
      await doc.ref.update({ password: hashed });
      migrated++;
      console.log(`✓ Migrated: ${data.email || doc.id}`);
    } catch (err) {
      errors++;
      console.error(`✗ Error migrating ${doc.id}:`, err.message);
    }
  }

  console.log(`\nMigration complete: ${migrated} migrated, ${skipped} skipped, ${errors} errors`);
  process.exit(0);
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
