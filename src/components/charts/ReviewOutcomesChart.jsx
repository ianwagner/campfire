import React from 'react';
import {
  Chart as ChartJS,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  TimeScale,
  Tooltip,
  Legend,
} from 'chart.js';
import 'chartjs-adapter-date-fns';
import { Line } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, TimeScale, PointElement, LineElement, Tooltip, Legend);

const getVar = (name, fallback) =>
  getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim() || fallback;

const ReviewOutcomesChart = ({ data }) => {
  const statuses = ['Approved', 'Rejected', 'Edit Requested'];
  const dates = [...new Set(Object.keys(data))].sort();
  const colors = [
    getVar('--approve-color', '#34d399'),
    getVar('--reject-color', '#f87171'),
    getVar('--edit-color', '#fbbf24'),
  ];
  const chartData = {
    labels: dates,
    datasets: statuses.map((status, idx) => ({
      label: status,
      data: dates.map((d) => (data[d] && data[d][status]) || 0),
      borderColor: colors[idx],
      fill: false,
    })),
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { position: 'bottom' } },
    scales: { x: { type: 'time', time: { unit: 'day' } } },
  };

  return (
    <div className="h-64 max-w-md mx-auto">
      <Line data={chartData} options={options} />
    </div>
  );
};

export default ReviewOutcomesChart;
