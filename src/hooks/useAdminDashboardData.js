import { useEffect, useState } from 'react';
import {
  collectionGroup,
  query,
  where,
  getDocs,
  getCountFromServer,
  Timestamp,
  getDoc,
  doc,
} from 'firebase/firestore';
import { db } from '../firebase/config';

const initial = {
  statusByBrand: {},
  uploads: {},
  reviewOutcomes: {},
  comments: {},
  unresolved: {},
  reviewTimes: {},
  statusTotals: { pending: 0, ready: 0, approved: 0, rejected: 0, edit_requested: 0 },
};

export default function useAdminDashboardData(range) {
  const [data, setData] = useState(initial);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!range?.start || !range?.end) return;
    const fetchData = async () => {
      setError('');
      try {
        const start = new Date(range.start);
        const end = new Date(range.end);
        end.setDate(end.getDate() + 1);
        const s = Timestamp.fromDate(start);
        const e = Timestamp.fromDate(end);

      const statusByBrand = {};
      const uploads = {};
      const reviewOutcomes = {};
      const comments = {};
      const unresolved = {};
      const reviewTimes = {};

      // Fetch overall counts by status first using Firestore's aggregation
      // queries. Previously the hook downloaded every asset document just to
      // compute these totals which was very slow and often returned 0 when the
      // query exceeded Firestore's response size limits. Using getCountFromServer
      // avoids that problem and significantly reduces the amount of data
      // transferred.
      const statusTotals = { pending: 0, ready: 0, approved: 0, rejected: 0, edit_requested: 0 };

        const statusList = ['pending', 'ready', 'approved', 'rejected', 'edit_requested'];
        await Promise.all(
          statusList.map(async (status) => {
            const snap = await getCountFromServer(
              query(
                collectionGroup(db, 'assets'),
                where('status', '==', status),
                where('uploadedAt', '>=', s),
                where('uploadedAt', '<', e)
              )
            );
            statusTotals[status] = snap.data().count || 0;
          })
        );
      const groupCache = {};
      const userCache = {};

      const assetSnap = await getDocs(
        query(collectionGroup(db, 'assets'), where('uploadedAt', '>=', s), where('uploadedAt', '<', e))
      );
      for (const d of assetSnap.docs) {
        const a = d.data();
        if (statusTotals[a.status] !== undefined) statusTotals[a.status] += 1;
        const brand = a.brandCode || 'Unknown';
        const statusKey = a.status === 'edit_requested' ? 'edit requested' : a.status;
        if (!statusByBrand[brand])
          statusByBrand[brand] = { ready: 0, pending: 0, approved: 0, 'edit requested': 0 };
        statusByBrand[brand][statusKey] = (statusByBrand[brand][statusKey] || 0) + 1;

        const gId = a.adGroupId || d.ref.parent.parent.id;
        if (!groupCache[gId]) {
          const gSnap = await getDoc(doc(db, 'adGroups', gId));
          groupCache[gId] = gSnap.exists() ? gSnap.data() : {};
        }
        const group = groupCache[gId];
        const uploader = group.uploadedBy || 'unknown';
        if (!uploads[uploader]) uploads[uploader] = {};
        if (a.uploadedAt?.toDate) {
          const ds = a.uploadedAt.toDate().toISOString().slice(0, 10);
          uploads[uploader][ds] = (uploads[uploader][ds] || 0) + 1;
        }
        if (a.status === 'edit_requested' && !a.isResolved) {
          const ds = a.lastUpdatedAt?.toDate ? a.lastUpdatedAt.toDate().toISOString().slice(0, 10) : null;
          if (ds) unresolved[ds] = (unresolved[ds] || 0) + 1;
        }
        if (a.uploadedAt && a.lastUpdatedAt) {
          const hours = (a.lastUpdatedAt.toDate() - a.uploadedAt.toDate()) / 3600000;
          const groupName = group.name || gId;
          if (!reviewTimes[groupName]) reviewTimes[groupName] = { designer: uploader, times: {}, count: {} };
          reviewTimes[groupName].times[uploader] =
            (reviewTimes[groupName].times[uploader] || 0) + hours;
          reviewTimes[groupName].count[uploader] = (reviewTimes[groupName].count[uploader] || 0) + 1;
        }
      }

      const respSnap = await getDocs(
        query(collectionGroup(db, 'responses'), where('timestamp', '>=', s), where('timestamp', '<', e))
      );
      respSnap.docs.forEach((d) => {
        const r = d.data();
        const ds = r.timestamp?.toDate ? r.timestamp.toDate().toISOString().slice(0, 10) : null;
        if (ds) {
          if (!reviewOutcomes[ds]) reviewOutcomes[ds] = { Approved: 0, Rejected: 0, 'Edit Requested': 0 };
          const status =
            r.response === 'approve'
              ? 'Approved'
              : r.response === 'reject'
              ? 'Rejected'
              : 'Edit Requested';
          reviewOutcomes[ds][status] += 1;
        }
        if (r.comment) {
          const reviewer = r.reviewerName || r.userEmail || r.userId || 'Unknown';
          const brand = r.brandCode || 'Unknown';
          if (!comments[reviewer]) comments[reviewer] = {};
          comments[reviewer][brand] = (comments[reviewer][brand] || 0) + 1;
        }
      });

      const uids = Object.keys(uploads);
      await Promise.all(
        uids.map(async (uid) => {
          try {
            const snap = await getDoc(doc(db, 'users', uid));
            userCache[uid] = snap.exists()
              ? snap.data().fullName || snap.data().email || uid
              : uid;
          } catch (err) {
            userCache[uid] = uid;
          }
        })
      );

      const uploadsByName = {};
      uids.forEach((uid) => {
        const name = userCache[uid] || uid;
        uploadsByName[name] = uploads[uid];
      });

      Object.keys(reviewTimes).forEach((g) => {
        const obj = reviewTimes[g];
        const times = {};
        Object.keys(obj.times).forEach((uid) => {
          const name = userCache[uid] || uid;
          const avg = obj.times[uid] / obj.count[uid];
          times[name] = parseFloat(avg.toFixed(2));
        });
        reviewTimes[g] = { designer: userCache[obj.designer] || obj.designer, times };
      });

      setData({
        statusByBrand,
        uploads: uploadsByName,
        reviewOutcomes,
        comments,
        unresolved,
        reviewTimes,
        statusTotals,
      });
    } catch (err) {
      console.error('Failed to load dashboard data', err);
      setError(err.message || 'Failed to load dashboard data');
    }
    };
    fetchData();
  }, [range]);

  return { ...data, error };
}
