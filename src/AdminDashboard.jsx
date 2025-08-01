import React, { useEffect, useState } from 'react';
import { FiThumbsDown, FiThumbsUp, FiEdit } from 'react-icons/fi';
import { collection, getDocs, query, where, Timestamp } from 'firebase/firestore';
import parseAdFilename from './utils/parseAdFilename.js';
import { db } from './firebase/config';
import PageWrapper from './components/PageWrapper.jsx';
import Table from './components/common/Table';
import MonthToggleSelector from './components/MonthToggleSelector.jsx';
import getMonthString from './utils/getMonthString.js';

function AdminDashboard({ agencyId, brandCodes = [], requireFilters = false } = {}) {
  const thisMonth = getMonthString();
  const [months, setMonths] = useState([]);
  const [selectedMonths, setSelectedMonths] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const fetchMonths = async () => {
      if (requireFilters && brandCodes.length === 0 && !agencyId) {
        if (active) {
          setMonths([]);
          setSelectedMonths([]);
        }
        return;
      }
      try {
        const base = collection(db, 'brands');
        let brandDocs = [];
        if (brandCodes.length > 0) {
          const chunks = [];
          for (let i = 0; i < brandCodes.length; i += 10) {
            chunks.push(brandCodes.slice(i, i + 10));
          }
          const docs = [];
          for (const chunk of chunks) {
            const snap = await getDocs(query(base, where('code', 'in', chunk)));
            docs.push(...snap.docs);
          }
          const seen = new Set();
          brandDocs = docs.filter((d) => {
            const data = d.data() || {};
            if (agencyId && data.agencyId !== agencyId) return false;
            if (seen.has(d.id)) return false;
            seen.add(d.id);
            return true;
          });
        } else if (agencyId) {
          const snap = await getDocs(query(base, where('agencyId', '==', agencyId)));
          brandDocs = snap.docs;
        } else {
          const snap = await getDocs(base);
          brandDocs = snap.docs;
        }
        const brands = brandDocs.map((d) => ({ id: d.id, ...d.data() }));
        const set = new Set();
        for (const brand of brands) {
          const contracts = Array.isArray(brand.contracts) ? brand.contracts : [];
          for (const c of contracts) {
            if (!c.startDate) continue;
            let sd = new Date(c.startDate);
            const ed = c.endDate ? new Date(c.endDate) : null;
            while (!ed || sd <= ed) {
              set.add(getMonthString(sd));
              if (!c.renews) break;
              sd.setMonth(sd.getMonth() + 1);
            }
          }
        }
        const arr = Array.from(set).sort();
        if (active) {
          setMonths(arr);
          if (arr.length > 0) setSelectedMonths([arr[arr.length - 1]]);
        }
      } catch (err) {
        console.error('Failed to fetch contract months', err);
        if (active) {
          setMonths([]);
          setSelectedMonths([]);
        }
      }
    };
    fetchMonths();
    return () => {
      active = false;
    };
  }, [agencyId, brandCodes]);

  useEffect(() => {
    let active = true;
    const fetchData = async () => {
      setLoading(true);
      if (requireFilters && brandCodes.length === 0 && !agencyId) {
        if (active) {
          setRows([]);
          setLoading(false);
        }
        return;
      }
      if (selectedMonths.length === 0) {
        if (active) {
          setRows([]);
          setLoading(false);
        }
        return;
      }
      try {
        const sorted = [...selectedMonths].sort();
        const [sYear, sMonth] = sorted[0].split('-').map(Number);
        const [eYear, eMonth] = sorted[sorted.length - 1].split('-').map(Number);
        const start = new Date(Date.UTC(sYear, sMonth - 1, 1));
        const end = new Date(Date.UTC(eYear, eMonth, 0, 23, 59, 59, 999));
        const monthsSet = new Set(selectedMonths);
        const base = collection(db, 'brands');
        let brandDocs = [];
        if (brandCodes.length > 0) {
          const chunks = [];
          for (let i = 0; i < brandCodes.length; i += 10) {
            chunks.push(brandCodes.slice(i, i + 10));
          }
          const docs = [];
          for (const chunk of chunks) {
            const snap = await getDocs(query(base, where('code', 'in', chunk)));
            docs.push(...snap.docs);
          }
          const seen = new Set();
          brandDocs = docs.filter((d) => {
            const data = d.data() || {};
            if (agencyId && data.agencyId !== agencyId) return false;
            if (seen.has(d.id)) return false;
            seen.add(d.id);
            return true;
          });
        } else if (agencyId) {
          const snap = await getDocs(query(base, where('agencyId', '==', agencyId)));
          brandDocs = snap.docs;
        } else {
          const snap = await getDocs(base);
          brandDocs = snap.docs;
        }
        const brands = brandDocs.map((d) => ({ id: d.id, ...d.data() }));
        const results = [];
        for (const brand of brands) {
          const contracts = Array.isArray(brand.contracts) ? brand.contracts : [];
          let contracted = 0;
          for (const c of contracts) {
            if (!c.startDate) continue;
            const stills = Number(c.stills || 0);
            const videos = Number(c.videos || 0);
            let sd = new Date(c.startDate);
            const ed = c.endDate ? new Date(c.endDate) : null;
            while (sd <= end && (!ed || sd <= ed)) {
              if (monthsSet.has(getMonthString(sd))) {
                contracted += stills + videos;
              }
              if (!c.renews) break;
              sd.setMonth(sd.getMonth() + 1);
            }
          }
          if (contracted === 0) continue;
          const q = query(
            collection(db, 'adGroups'),
            where('brandCode', '==', brand.code || brand.codeId || ''),
            where('dueDate', '>=', Timestamp.fromDate(start)),
            where('dueDate', '<=', Timestamp.fromDate(end)),
          );
          const gSnap = await getDocs(q);
          let briefedCount = 0;
          const approvedSet = new Set();
          const deliveredSet = new Set();

          for (const g of gSnap.docs) {
            const gData = g.data() || {};
            const due = gData.dueDate?.toDate ? gData.dueDate.toDate() : null;
            if (!due || !monthsSet.has(getMonthString(due))) continue;
            const assetsSnap = await getDocs(
              collection(db, 'adGroups', g.id, 'assets')
            );
            let recipeSnap;
            try {
              recipeSnap = await getDocs(
                collection(db, 'adGroups', g.id, 'recipes')
              );
            } catch (err) {
              console.error('Failed to load recipes', err);
              recipeSnap = { docs: [] };
            }

            const assetRecipes = new Set();
            assetsSnap.docs.forEach((ad) => {
              const data = ad.data() || {};
              const info = parseAdFilename(data.filename || '');
              const recipe = data.recipeCode || info.recipeCode || '';
              if (!recipe) return;
              const groupCode = data.adGroupCode || info.adGroupCode || g.id;
              const key = `${groupCode}-${recipe}`;
              assetRecipes.add(key);
              if (
                ['ready', 'approved', 'rejected', 'edit_requested'].includes(
                  data.status
                )
              )
                deliveredSet.add(key);
              if (data.status === 'approved') approvedSet.add(key);
            });

            const recipeCount =
              recipeSnap.docs.length > 0
                ? recipeSnap.docs.length
                : assetRecipes.size;
            briefedCount += recipeCount;
          }

          const briefed = briefedCount;
          const delivered = deliveredSet.size;
          const approved = approvedSet.size;
          const needed = contracted > delivered ? contracted - delivered : 0;
          const status =
            delivered < contracted
              ? 'under'
              : delivered > contracted
                ? 'over'
                : 'complete';
          results.push({
            id: brand.id,
            code: brand.code,
            name: brand.name,
            contracted,
            briefed,
            delivered,
            approved,
            needed,
            status,
          });
        }
        if (active) setRows(results);
      } catch (err) {
        console.error('Failed to fetch dashboard data', err);
        if (active) setRows([]);
      } finally {
        if (active) setLoading(false);
      }
    };
    fetchData();
    return () => {
      active = false;
    };
  }, [selectedMonths, agencyId, brandCodes]);

  return (
    <PageWrapper title="Dashboard">
      <MonthToggleSelector
        months={months}
        selected={selectedMonths[0] || ''}
        onSelect={(m) => setSelectedMonths([m])}
      />
      {loading ? (
        <p>Loading...</p>
      ) : rows.length === 0 ? (
        <p>No contracts found.</p>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>Brand</th>
              <th>Contracted</th>
              <th>Briefed</th>
              <th>Delivered</th>
              <th>Approved</th>
              <th>Needed</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.code || r.name}</td>
                <td className="text-center">{r.contracted}</td>
                <td className="text-center">{r.briefed}</td>
                <td className="text-center">{r.delivered}</td>
                <td className="text-center">{r.approved}</td>
                <td className="text-center">{r.needed}</td>
                <td className="text-center">
                  {r.status === 'under' ? (
                    <span className="flex items-center justify-center gap-1 text-reject">
                      <FiThumbsDown />
                      {r.status}
                    </span>
                  ) : r.status === 'over' ? (
                    <span className="flex items-center justify-center gap-1 text-edit">
                      <FiEdit />
                      {r.status}
                    </span>
                  ) : r.status === 'complete' ? (
                    <span className="flex items-center justify-center gap-1 text-approve">
                      <FiThumbsUp />
                      {r.status}
                    </span>
                  ) : (
                    r.status
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </PageWrapper>
  );
}

export default AdminDashboard;
