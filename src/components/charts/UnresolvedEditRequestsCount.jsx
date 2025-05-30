import React from 'react';
import {
  Chart as ChartJS,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  TimeScale,
  Tooltip,
} from 'chart.js';
import 'chartjs-adapter-date-fns';
import { Line } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, TimeScale, PointElement, LineElement, Tooltip);

const getVar = (name, fallback) =>
  getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim() || fallback;

const UnresolvedEditRequestsCount = ({ data }) => {
  const dates = Object.keys(data).sort();
  const chartData = {
    labels: dates,
    datasets: [
      {
        label: 'Unresolved Edit Requests',
        data: dates.map((d) => data[d]),
        borderColor: getVar('--edit-color', '#fbbf24'),
        fill: false,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: { x: { type: 'time', time: { unit: 'day' } } },
  };

  return (
    <div className="h-64 max-w-md mx-auto">
      <Line data={chartData} options={options} />
    </div>
  );
};

export default UnresolvedEditRequestsCount;
