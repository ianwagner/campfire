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
import ChartDataLabels from 'chartjs-plugin-datalabels';
import { Line } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, TimeScale, PointElement, LineElement, Tooltip, Legend, ChartDataLabels);

const getVar = (name, fallback) =>
  getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim() || fallback;

const AssetUploadsChart = ({ data }) => {
  const designers = Object.keys(data);
  const dates = [...new Set(designers.flatMap((d) => Object.keys(data[d])))].sort();
  const colors = [
    getVar('--accent-color', '#60a5fa'),
    getVar('--approve-color', '#34d399'),
    getVar('--edit-color', '#fbbf24'),
    getVar('--reject-color', '#f87171'),
  ];
  const chartData = {
    labels: dates,
    datasets: designers.map((des, idx) => ({
      label: des,
      data: dates.map((dt) => data[des][dt] || 0),
      fill: false,
      borderColor: colors[idx % colors.length],
    })),
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    parsing: false,
    plugins: {
      legend: { position: 'bottom' },
      datalabels: { display: false },
    },
    scales: {
      x: { type: 'time', time: { unit: 'day' } },
    },
  };

  return (
    <div className="h-64 max-w-md mx-auto">
      <Line data={chartData} options={options} />
    </div>
  );
};

export default AssetUploadsChart;
