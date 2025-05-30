import React, { useState } from 'react';
import DateRangeSelector from './components/DateRangeSelector';
import AdStatusByBrandChart from './components/charts/AdStatusByBrandChart';
import AverageReviewTimeChart from './components/charts/AverageReviewTimeChart';
import AssetUploadsChart from './components/charts/AssetUploadsChart';
import ReviewOutcomesChart from './components/charts/ReviewOutcomesChart';
import CommentFrequencyHeatmap from './components/charts/CommentFrequencyHeatmap';
import UnresolvedEditRequestsCount from './components/charts/UnresolvedEditRequestsCount';

const AdminDashboard = () => {
  const [range, setRange] = useState(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 30);
    return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
  });
  const [tab, setTab] = useState('overview');

  // TODO: Replace with real Firestore queries
  const sampleData = {
    statusByBrand: {
      ACME: { ready: 5, pending: 3, approved: 10, 'edit requested': 2 },
      GLOBEX: { ready: 2, pending: 1, approved: 4, 'edit requested': 1 },
    },
    reviewTimes: {
      GroupA: { designer: 'Alice', times: { Alice: 24 } },
      GroupB: { designer: 'Bob', times: { Bob: 12 } },
    },
    uploads: {
      Alice: { '2025-01-01': 2, '2025-01-02': 3 },
      Bob: { '2025-01-01': 1, '2025-01-03': 2 },
    },
    reviewOutcomes: {
      '2025-01-01': { Approved: 2, Rejected: 1, 'Edit Requested': 0 },
      '2025-01-02': { Approved: 1, Rejected: 0, 'Edit Requested': 1 },
    },
    comments: {
      Alice: { ACME: 3, GLOBEX: 1 },
      Bob: { ACME: 2, GLOBEX: 2 },
    },
    unresolved: {
      '2025-01-01': 2,
      '2025-01-02': 3,
    },
  };

  const renderOverview = () => (
    <div className="space-y-6">
      <AdStatusByBrandChart data={sampleData.statusByBrand} />
      <AssetUploadsChart data={sampleData.uploads} />
      <ReviewOutcomesChart data={sampleData.reviewOutcomes} />
      <UnresolvedEditRequestsCount data={sampleData.unresolved} />
    </div>
  );

  const renderBrand = () => (
    <div className="space-y-6">
      <AverageReviewTimeChart data={sampleData.reviewTimes} />
      <CommentFrequencyHeatmap data={sampleData.comments} />
    </div>
  );

  return (
    <div className="p-4 space-y-4">
      <h1>Admin Dashboard</h1>
      <DateRangeSelector
        startDate={range.start}
        endDate={range.end}
        onChange={(r) => setRange(r)}
      />
      <div className="flex space-x-4 mb-4">
        {['overview', 'brand', 'user'].map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1 rounded ${tab === t ? 'bg-accent-10 text-accent' : 'border'}`}
          >
            {t === 'overview' ? 'Overview' : t === 'brand' ? 'Brand' : 'User Management'}
          </button>
        ))}
      </div>
      {tab === 'overview' && renderOverview()}
      {tab === 'brand' && renderBrand()}
      {tab === 'user' && <p>User management coming soon.</p>}
    </div>
  );
};

export default AdminDashboard;
