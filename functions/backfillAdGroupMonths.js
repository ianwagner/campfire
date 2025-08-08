import admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

function monthKey(date) {
  return date.toISOString().slice(0, 7);
}

async function backfillAdGroupMonths() {
  const snap = await db.collection('adGroups').get();
  let updated = 0;
  for (const doc of snap.docs) {
    const data = doc.data() || {};
    const hasMonth = data.month;
    const dueDate = data.dueDate && data.dueDate.toDate ? data.dueDate.toDate() : data.dueDate;
    if (!hasMonth && dueDate instanceof Date && !isNaN(dueDate)) {
      const month = monthKey(dueDate);
      await doc.ref.update({ month });
      updated++;
    }
  }
  console.log(`Updated ${updated} adGroups.`);
}

backfillAdGroupMonths()
  .then(() => {
    console.log('Backfill complete');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Backfill failed', err);
    process.exit(1);
  });
