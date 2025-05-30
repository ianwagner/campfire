import React, { useState } from 'react';
import DateRangeSelector from './components/DateRangeSelector';
import AdStatusByBrandChart from './components/charts/AdStatusByBrandChart';
import AverageReviewTimeChart from './components/charts/AverageReviewTimeChart';
import AssetUploadsChart from './components/charts/AssetUploadsChart';
import ReviewOutcomesChart from './components/charts/ReviewOutcomesChart';
import CommentFrequencyHeatmap from './components/charts/CommentFrequencyHeatmap';
import UnresolvedEditRequestsCount from './components/charts/UnresolvedEditRequestsCount';
import useAdminDashboardData from './hooks/useAdminDashboardData';

const AdminDashboard = () => {
  const [range, setRange] = useState(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 30);
    return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
  });
  const [tab, setTab] = useState('overview');

  const data = useAdminDashboardData(range);

  const renderOverview = () => (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      <AdStatusByBrandChart data={data.statusByBrand} />
      <AssetUploadsChart data={data.uploads} />
      <ReviewOutcomesChart data={data.reviewOutcomes} />
      <UnresolvedEditRequestsCount data={data.unresolved} />
    </div>
  );

  const renderBrand = () => (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      <AverageReviewTimeChart data={data.reviewTimes} />
      <CommentFrequencyHeatmap data={data.comments} />
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
