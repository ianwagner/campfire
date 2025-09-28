import React, { useMemo, useState } from 'react';
import ClientGroupCard from './components/ClientGroupCard.jsx';
import useClientAdGroups from './useClientAdGroups.js';

const ClientAdGroups = ({ user, brandCodes = [] }) => {
  const { groups, loading, hasNegativeCredits, months } = useClientAdGroups(
    user,
    brandCodes
  );
  const [filter, setFilter] = useState('');
  const [monthFilter, setMonthFilter] = useState('');

  const filteredGroups = useMemo(
    () =>
      groups.filter(
        (g) =>
          g.name.toLowerCase().includes(filter.toLowerCase()) &&
          (!monthFilter || g.month === monthFilter)
      ),
    [groups, filter, monthFilter]
  );

  return (
    <div className="min-h-screen p-4">
      <h1 className="text-2xl font-semibold mb-4">Ad Groups</h1>
      {hasNegativeCredits && (
        <div className="mb-4 rounded border border-red-200 bg-red-100 p-2 text-red-800">
          Your credit balance is negative. Please add more credits.
        </div>
      )}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <input
          type="text"
          placeholder="Search groups"
          className="border px-2 py-1 rounded flex-1 min-w-[200px]"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <select
          className="border px-2 py-1 rounded"
          value={monthFilter}
          onChange={(e) => setMonthFilter(e.target.value)}
        >
          <option value="">All months</option>
          {months.map((m) => {
            const label = new Date(
              Number(m.slice(0, 4)),
              Number(m.slice(-2)) - 1,
              1
            ).toLocaleString('default', { month: 'short', year: 'numeric' });
            return (
              <option key={m} value={m}>
                {label}
              </option>
            );
          })}
        </select>
      </div>
      {loading ? (
        <p>Loading groups...</p>
      ) : filteredGroups.length === 0 ? (
        <p>No ad groups found.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4 xl:grid-cols-5">
          {filteredGroups.map((g) => (
            <ClientGroupCard key={g.id} group={g} />
          ))}
        </div>
      )}
    </div>
  );
};

export default ClientAdGroups;
