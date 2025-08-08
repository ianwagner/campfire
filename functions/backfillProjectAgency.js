import admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

async function backfillProjectAgency() {
  const snap = await db.collection('projects').where('agencyId', '==', null).get();
  let updated = 0;
  for (const doc of snap.docs) {
    const data = doc.data() || {};
    const userId = data.userId;
    if (!userId) continue;
    try {
      const userSnap = await db.collection('users').doc(userId).get();
      const agencyId = userSnap.data()?.agencyId;
      if (agencyId) {
        await doc.ref.update({ agencyId });
        updated++;
      }
    } catch (err) {
      console.error('Failed to update project', doc.id, err);
    }
  }
  console.log(`Updated ${updated} projects.`);
}

backfillProjectAgency()
  .then(() => {
    console.log('Backfill complete');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Backfill failed', err);
    process.exit(1);
  });
