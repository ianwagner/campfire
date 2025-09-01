import React from 'react';
import { Link } from 'react-router-dom';
import useAgencies from './useAgencies';

const AdminAgencies = () => {
  const { agencies, loading } = useAgencies();

  return (
    <div className="min-h-screen p-4">
      <h1 className="text-2xl mb-4">Agencies</h1>
      {loading ? (
        <p>Loading agencies...</p>
      ) : agencies.length === 0 ? (
        <p>No agencies found.</p>
      ) : (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {agencies.map((agency) => (
            <Link
              key={agency.id}
              to={`/admin/agencies/${agency.id}`}
              className="border rounded p-4 hover:shadow"
            >
              <h2 className="font-semibold">{agency.name || agency.id}</h2>
              <p className="text-sm text-gray-600">{agency.id}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminAgencies;
