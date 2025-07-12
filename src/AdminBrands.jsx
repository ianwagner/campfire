import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  FiPlus,
  FiEdit2,
  FiTrash,
  FiArchive,
  FiRotateCcw,
  FiList,
  FiGrid,
} from 'react-icons/fi';
import { collection, getDocs, deleteDoc, doc, updateDoc, serverTimestamp, query, where } from 'firebase/firestore';
import { db, auth } from './firebase/config';
import useUserRole from './useUserRole';
import createArchiveTicket from './utils/createArchiveTicket';
import useAgencies from './useAgencies';
import Table from './components/common/Table';
import IconButton from './components/IconButton.jsx';
import TabButton from './components/TabButton.jsx';
import BrandCard from './components/BrandCard.jsx';

const AdminBrands = () => {
  const [brands, setBrands] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [sortField, setSortField] = useState('code');
  const [showArchived, setShowArchived] = useState(false);
  const [view, setView] = useState('cards');
  const user = auth.currentUser;
  const { role } = useUserRole(user?.uid);
  const isAdmin = role === 'admin';
  const isManager = role === 'manager';
  const { agencies } = useAgencies();
  const agencyMap = useMemo(
    () => Object.fromEntries(agencies.map((a) => [a.id, a.name])),
    [agencies]
  );

  useEffect(() => {
    const fetchBrands = async () => {
      setLoading(true);
      try {
        const base = collection(db, 'brands');
        const q = !showArchived ? query(base, where('archived', '!=', true)) : base;
        const snap = await getDocs(q);
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setBrands(list);
      } catch (err) {
        console.error('Failed to fetch brands', err);
        setBrands([]);
      } finally {
        setLoading(false);
      }
    };

    fetchBrands();
  }, [showArchived]);

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this brand?')) return;
    try {
      await deleteDoc(doc(db, 'brands', id));
      setBrands((prev) => prev.filter((b) => b.id !== id));
    } catch (err) {
      console.error('Failed to delete brand', err);
    }
  };

  const handleArchive = async (id) => {
    if (!window.confirm('Archive this brand?')) return;
    try {
      await updateDoc(doc(db, 'brands', id), {
        archived: true,
        archivedAt: serverTimestamp(),
        archivedBy: auth.currentUser?.uid || null,
      });
      setBrands((prev) =>
        prev.map((b) => (b.id === id ? { ...b, archived: true } : b))
      );
      await createArchiveTicket({ target: 'brand', brandId: id });
    } catch (err) {
      console.error('Failed to archive brand', err);
    }
  };

  const handleRestore = async (id) => {
    try {
      await updateDoc(doc(db, 'brands', id), {
        archived: false,
        archivedAt: null,
        archivedBy: null,
      });
      setBrands((prev) =>
        prev.map((b) => (b.id === id ? { ...b, archived: false } : b))
      );
    } catch (err) {
      console.error('Failed to restore brand', err);
    }
  };

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
          <Link to="/admin/brands/new" className="btn-primary flex items-center gap-1">
            <FiPlus />
            Create Brand
          </Link>
          <div className="flex flex-wrap gap-2 flex-1 order-last md:order-none justify-center">
            <TabButton active={view === 'list'} onClick={() => setView('list')} aria-label="List view">
              <FiList />
            </TabButton>
            <TabButton active={view === 'cards'} onClick={() => setView('cards')} aria-label="Card view">
              <FiGrid />
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
            <FiArchive />
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
                      <IconButton as="a" href={`/admin/brands/${brand.id}`} aria-label="Edit">
                        <FiEdit2 />
                      </IconButton>
                      {(isAdmin || isManager) && (
                        brand.archived ? (
                          <IconButton
                            onClick={() => handleRestore(brand.id)}
                            aria-label="Restore"
                          >
                            <FiRotateCcw />
                          </IconButton>
                        ) : (
                          <IconButton
                            onClick={() => handleArchive(brand.id)}
                            aria-label="Archive"
                          >
                            <FiArchive />
                          </IconButton>
                        )
                      )}
                      {isAdmin && (
                        <IconButton
                          onClick={() => handleDelete(brand.id)}
                          aria-label="Delete"
                        >
                          <FiTrash />
                        </IconButton>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {displayBrands.map((brand) => (
              <Link key={brand.id} to={`/admin/brands/${brand.id}`}>
                <BrandCard brand={brand} />
              </Link>
            ))}
          </div>
        )}
      </div>
    );
};

export default AdminBrands;
