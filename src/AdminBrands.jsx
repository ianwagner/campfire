import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiPlus } from 'react-icons/fi';
import { collection, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { db } from './firebase/config';
import Table from './components/common/Table';

const AdminBrands = () => {
  const [brands, setBrands] = useState([]);
  const [loading, setLoading] = useState(true);

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
    if (!window.confirm('Delete this brand?')) return;
    try {
      await deleteDoc(doc(db, 'brands', id));
      setBrands((prev) => prev.filter((b) => b.id !== id));
    } catch (err) {
      console.error('Failed to delete brand', err);
    }
  };

  return (
    <div className="min-h-screen p-4">
        <h1 className="text-2xl mb-4">Brands</h1>
        <Link to="/admin/brands/new" className="btn-primary flex items-center gap-1 mb-2">
          <FiPlus />
          Create Brand
        </Link>
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
              {brands.map((brand) => (
                <tr key={brand.id}>
                  <td>{brand.code}</td>
                  <td>{brand.name}</td>
                  <td>{brand.agencyId || ''}</td>
                  <td className="text-center">
                    <div className="flex items-center justify-center">
                      <a
                        href={`/admin/brands/${brand.id}`}
                        className="btn-action mr-2"
                      >
                        Edit
                      </a>
                      <button
                        onClick={() => handleDelete(brand.id)}
                        className="btn-action btn-delete"
                      >
                        Delete
                      </button>
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
