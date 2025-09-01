import React from 'react';
import { Link } from 'react-router-dom';
import useAgencies from './useAgencies';
import AgencyCard from './components/AgencyCard.jsx';

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
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {agencies.map((agency) => (
            <Link key={agency.id} to={`/admin/agencies/${agency.id}`}>
              <AgencyCard agency={agency} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminAgencies;
