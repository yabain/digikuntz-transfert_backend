import mongoose from 'mongoose';
const mongodb = encodeURIComponent('digikuntzTransfer123?');
const uri = `mongodb+srv://digikuntz:${mongodb}@digikuntztransfercluster.rpjxt5f.mongodb.net/?retryWrites=true&w=majority`;
await mongoose.connect(uri, { serverSelectionTimeoutMS: 20000 }).catch((e) => { console.error('connect ERR', e.message); process.exit(1); });
const use = mongoose.connection.useDb('test');
const anns = await use.collection('announcements').find().sort({ createdAt: -1 }).limit(5).toArray();
console.log('--- announcements ---');
for (const a of anns) {
  console.log('==', String(a._id), '|', a.status, '| subject:', a.subject, '| sentAt:', a.sentAt, '| scheduledAt:', a.scheduledAt);
  console.log('  snapshot:', JSON.stringify((a.recipientsSnapshot || []).map((r) => ({ userName: r.userName, fn: r.userFirstName, ln: r.userLastName, email: r.email }))));
}
const dels = await use.collection('announcementdeliveries').find().sort({ createdAt: -1 }).limit(8).toArray();
console.log('--- deliveries ---');
for (const d of dels) {
  console.log('==', String(d.announcementId), '|', d.status, '| attempts:', d.attempts, '| lastError:', JSON.stringify(d.lastError));
  console.log('  r:', JSON.stringify({ userName: d.userName, fn: d.userFirstName, ln: d.userLastName, email: d.email, phone: d.userPhone }));
}
const users = await use.collection('users').find().limit(10).toArray();
console.log('--- users ---');
for (const u of users) {
  console.log('==', u.email, '| acct:', u.accountType, '| first:', u.firstName, '| last:', u.lastName, '| name:', u.name, '| phone:', u.phone);
}
process.exit(0);