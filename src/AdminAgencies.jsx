import React from 'react';
import { Link } from 'react-router-dom';
import useAgencies from './useAgencies';
import Table from './components/common/Table';

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
        <Table>
          <thead>
            <tr>
              <th>Name</th>
              <th>ID</th>
            </tr>
          </thead>
          <tbody>
            {agencies.map((agency) => (
              <tr key={agency.id}>
                <td>
                  <Link
                    to={`/agency/theme?agencyId=${agency.id}`}
                    className="text-blue-600 underline"
                  >
                    {agency.name || agency.id}
                  </Link>
                </td>
                <td>{agency.id}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
};

export default AdminAgencies;
