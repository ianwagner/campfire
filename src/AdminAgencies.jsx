import React from 'react';
import { Link } from 'react-router-dom';
import useAgencies from './useAgencies';
import OptimizedImage from './components/OptimizedImage.jsx';

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
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
          {agencies.map((agency) => (
            <Link
              key={agency.id}
              to={`/admin/agencies/${agency.id}`}
              className="border rounded-lg p-4 hover:shadow flex flex-col items-center"
            >
              {agency.logoUrl && (
                <OptimizedImage
                  pngUrl={agency.logoUrl}
                  alt={`${agency.name || agency.id} logo`}
                  className="h-16 w-auto mb-2 object-contain"
                />
              )}
              <h2 className="text-lg font-semibold mb-1">
                {agency.name || agency.id}
              </h2>
              <p className="text-sm text-gray-600">ID: {agency.id}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminAgencies;
