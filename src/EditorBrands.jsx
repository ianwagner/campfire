import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db, auth } from './firebase/config';
import useUserRole from './useUserRole';
import useAgencies from './useAgencies';
import Table from './components/common/Table';
import IconButton from './components/IconButton.jsx';
import TabButton from './components/TabButton.jsx';
import BrandCard from './components/BrandCard.jsx';

const EditorBrands = () => {
  const [brands, setBrands] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [sortField, setSortField] = useState('code');
  const [showArchived, setShowArchived] = useState(false);
  const [view, setView] = useState('cards');
  const user = auth.currentUser;
  const { brandCodes } = useUserRole(user?.uid);
  const { agencies } = useAgencies();
  const agencyMap = useMemo(
    () => Object.fromEntries(agencies.map((a) => [a.id, a.name])),
    [agencies]
  );

  useEffect(() => {
    const fetchBrands = async () => {
      if (!brandCodes || brandCodes.length === 0) {
        setBrands([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const base = collection(db, 'brands');
        const chunks = [];
        for (let i = 0; i < brandCodes.length; i += 10) {
          chunks.push(brandCodes.slice(i, i + 10));
        }
        const docs = [];
        for (const chunk of chunks) {
          const conditions = [where('code', 'in', chunk)];
          if (!showArchived) conditions.push(where('archived', '!=', true));
          const q = query(base, ...conditions);
          const snap = await getDocs(q);
          docs.push(...snap.docs);
        }
        const seen = new Set();
        const list = docs
          .filter((d) => {
            if (seen.has(d.id)) return false;
            seen.add(d.id);
            return true;
          })
          .map((d) => ({ id: d.id, ...d.data() }));
        setBrands(list);
      } catch (err) {
        console.error('Failed to fetch brands', err);
        setBrands([]);
      } finally {
        setLoading(false);
      }
    };

    fetchBrands();
  }, [showArchived, brandCodes]);

  const term = filter.toLowerCase();
  const displayBrands = brands
    .filter(
      (b) =>
        (showArchived || !b.archived) &&
        (!term ||
          b.code?.toLowerCase().includes(term) ||
          b.name?.toLowerCase().includes(term))
    )
    .sort((a, b) => {
      if (sortField === 'name') return (a.name || '').localeCompare(b.name || '');
      return (a.code || '').localeCompare(b.code || '');
    });

  return (
    <div className="min-h-screen p-4">
        <h1 className="text-2xl mb-4">Brands</h1>
        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
          <div className="flex flex-wrap gap-2 flex-1 order-last md:order-none justify-center">
            <TabButton active={view === 'list'} onClick={() => setView('list')} aria-label="List view">
              List
            </TabButton>
            <TabButton active={view === 'cards'} onClick={() => setView('cards')} aria-label="Card view">
              Cards
            </TabButton>
          </div>
          <div className="flex items-center gap-2">
          <select
            value={sortField}
            onChange={(e) => setSortField(e.target.value)}
            className="p-1 border rounded"
          >
            <option value="code">Code</option>
            <option value="name">Name</option>
          </select>
          <TabButton
            type="button"
            active={showArchived}
            onClick={() => setShowArchived((p) => !p)}
            aria-label={showArchived ? 'Hide archived' : 'Show archived'}
          >
            Archive
          </TabButton>
          <input
            type="text"
            placeholder="Filter"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
              className="p-1 border rounded"
            />
          </div>
        </div>
        {loading ? (
          <p>Loading brands...</p>
        ) : brands.length === 0 ? (
          <p>No brands found.</p>
        ) : view === 'list' ? (
          <Table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Agency</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {displayBrands.map((brand) => (
                <tr key={brand.id}>
                  <td>{brand.code}</td>
                  <td>{brand.name}</td>
                  <td>{agencyMap[brand.agencyId] || brand.agencyId}</td>
                  <td className="text-center">
                    <div className="flex items-center justify-center gap-2">
                      <IconButton as={Link} to={`/editor/brands/${brand.id}`} aria-label="Edit">
                        Edit
                      </IconButton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {displayBrands.map((brand) => (
              <Link key={brand.id} to={`/editor/brands/${brand.id}`}>
                <BrandCard brand={brand} />
              </Link>
            ))}
          </div>
        )}
      </div>
    );
};

export default EditorBrands;
