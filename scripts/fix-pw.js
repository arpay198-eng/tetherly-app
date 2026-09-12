const bcrypt = require('bcryptjs');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('../firebase-service-account.json');

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

bcrypt.hash('Rj6542', 10).then(async (hash) => {
  const users = await db.collection('users').where('email', '==', 'rohimbadsha0672@gmail.com').get();
  const userDoc = users.docs[0];
  await userDoc.ref.update({ password: hash });
  console.log('Password updated properly for: ' + userDoc.id);
  
  const isValid = await bcrypt.compare('Rj6542', hash);
  console.log('Self-test match:', isValid);
  process.exit(0);
}).catch(console.error);
