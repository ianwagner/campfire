import React, { useState } from 'react';
import AdGroupListView from './components/AdGroupListView.jsx';
import useAdGroups from './useAdGroups';

const ClientAdGroups = ({ brandCodes = [] }) => {
  const [filter, setFilter] = useState('');
  const [view, setView] = useState('kanban');
  const { groups, loading } = useAdGroups(brandCodes, false);

  return (
    <div className="min-h-screen p-4">
      <h1 className="text-2xl font-semibold mb-4">Ad Groups</h1>
      <AdGroupListView
        groups={groups}
        loading={loading}
        filter={filter}
        onFilterChange={setFilter}
        view={view}
        onViewChange={setView}
        linkToDetail
        allowedViews={['kanban']}
      />
    </div>
  );
};

export default ClientAdGroups;
