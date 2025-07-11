import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiPlus, FiEdit2, FiTrash } from 'react-icons/fi';
import { collection, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { db, auth } from './firebase/config';
import useUserRole from './useUserRole';
import Table from './components/common/Table';
import IconButton from './components/IconButton.jsx';

const AdminBrands = () => {
  const [brands, setBrands] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [sortField, setSortField] = useState('code');
  const user = auth.currentUser;
  const { role } = useUserRole(user?.uid);
  const isManager = role === 'manager';

  useEffect(() => {
    const fetchBrands = async () => {
      setLoading(true);
      try {
        const snap = await getDocs(collection(db, 'brands'));
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
  }, []);

  const handleDelete = async (id) => {
    if (isManager) {
      window.alert('Managers cannot delete brands');
      return;
    }
    if (!window.confirm('Delete this brand?')) return;
    try {
      await deleteDoc(doc(db, 'brands', id));
      setBrands((prev) => prev.filter((b) => b.id !== id));
    } catch (err) {
      console.error('Failed to delete brand', err);
    }
  };

  const term = filter.toLowerCase();
  const displayBrands = brands
    .filter(
      (b) =>
        !term ||
        b.code?.toLowerCase().includes(term) ||
        b.name?.toLowerCase().includes(term)
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
          <div className="flex items-center gap-2">
            <select
              value={sortField}
              onChange={(e) => setSortField(e.target.value)}
              className="p-1 border rounded"
            >
              <option value="code">Code</option>
              <option value="name">Name</option>
            </select>
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
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Agency ID</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {displayBrands.map((brand) => (
                <tr key={brand.id}>
                  <td>{brand.code}</td>
                  <td>{brand.name}</td>
                  <td>{brand.agencyId || ''}</td>
                  <td className="text-center">
                    <div className="flex items-center justify-center gap-2">
                      <IconButton as="a" href={`/admin/brands/${brand.id}`} aria-label="Edit">
                        <FiEdit2 />
                      </IconButton>
                      {!isManager && (
                        <IconButton
                          onClick={() => handleDelete(brand.id)}
                          className="btn-delete"
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
        )}
      </div>
    );
};

export default AdminBrands;
