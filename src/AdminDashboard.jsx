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

  const { error, ...data } = useAdminDashboardData(range);

  const renderOverview = () => {
    const totals = data.statusTotals || {};
    return (
      <div className="flex flex-wrap justify-center gap-4">
        <div className="stat-card status-pending">
          <p className="stat-card-title">Pending</p>
          <p className="stat-card-value">{totals.pending || 0}</p>
        </div>
        <div className="stat-card status-ready">
          <p className="stat-card-title">Ready</p>
          <p className="stat-card-value">{totals.ready || 0}</p>
        </div>
        <div className="stat-card status-approved">
          <p className="stat-card-title">Approved</p>
          <p className="stat-card-value">{totals.approved || 0}</p>
        </div>
        <div className="stat-card status-rejected">
          <p className="stat-card-title">Rejected</p>
          <p className="stat-card-value">{totals.rejected || 0}</p>
        </div>
        <div className="stat-card status-edit_requested">
          <p className="stat-card-title">Edit</p>
          <p className="stat-card-value">{totals.edit_requested || 0}</p>
        </div>
      </div>
    );
  };

  const renderBrand = () => (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      <AdStatusByBrandChart data={data.statusByBrand} />
      <AssetUploadsChart data={data.uploads} />
      <ReviewOutcomesChart data={data.reviewOutcomes} />
      <UnresolvedEditRequestsCount data={data.unresolved} />
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
      {error && <div className="text-red-500 text-center">{error}</div>}
      <div className="flex space-x-4 mb-4">
        {['overview', 'brand'].map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1 rounded ${tab === t ? 'bg-accent-10 text-accent' : 'border'}`}
          >
            {t === 'overview' ? 'Overview' : 'Brand'}
          </button>
        ))}
      </div>
      {tab === 'overview' && renderOverview()}
      {tab === 'brand' && renderBrand()}
    </div>
  );
};

export default AdminDashboard;
