import { useEffect, useState } from 'react';
import {
  collectionGroup,
  collection,
  query,
  where,
  getDocs,
  Timestamp,
  getDoc,
  doc,
} from 'firebase/firestore';
import parseAdFilename from '../utils/parseAdFilename';
import { db } from '../firebase/config';

const initial = {
  statusByBrand: {},
  uploads: {},
  reviewOutcomes: {},
  comments: {},
  unresolved: {},
  reviewTimes: {},
};

export default function useAdminDashboardData(range) {
  const [data, setData] = useState(initial);

  useEffect(() => {
    if (!range?.start || !range?.end) return;
    const fetchData = async () => {
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
      const recipeBrands = {};
      const groupCache = {};
      const userCache = {};

      const assetSnap = await getDocs(
        query(collectionGroup(db, 'assets'), where('uploadedAt', '>=', s), where('uploadedAt', '<', e))
      );
      for (const d of assetSnap.docs) {
        const a = d.data();
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
        const info = parseAdFilename(a.filename || '');
        const recipe = a.recipeCode || info.recipeCode || '';
        if (recipe && !recipeBrands[recipe]) recipeBrands[recipe] = brand;
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

      const recipeSnap = await getDocs(collection(db, 'recipes'));
      recipeSnap.docs.forEach((d) => {
        const recipeCode = d.id;
        const brand = recipeBrands[recipeCode] || 'Unknown';
        const hist = Array.isArray(d.data().history) ? d.data().history : [];
        hist.forEach((h) => {
          const t = h.timestamp?.toDate ? h.timestamp.toDate() : null;
          if (!t) return;
          if (t >= start && t < end) {
            const ds = t.toISOString().slice(0, 10);
            if (!reviewOutcomes[ds])
              reviewOutcomes[ds] = { Approved: 0, Rejected: 0, 'Edit Requested': 0 };
            const status =
              h.status === 'approved'
                ? 'Approved'
                : h.status === 'rejected'
                ? 'Rejected'
                : 'Edit Requested';
            reviewOutcomes[ds][status] += 1;
            if (h.editComment) {
              const reviewer = h.user || 'Unknown';
              if (!comments[reviewer]) comments[reviewer] = {};
              comments[reviewer][brand] = (comments[reviewer][brand] || 0) + 1;
            }
          }
        });
      });

      const uids = Object.keys(uploads);
      await Promise.all(
        uids.map(async (uid) => {
          const snap = await getDoc(doc(db, 'users', uid));
          userCache[uid] = snap.exists() ? snap.data().fullName || snap.data().email || uid : uid;
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
      });
    };
    fetchData();
  }, [range]);

  return data;
}
