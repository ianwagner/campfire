import React from 'react';
import {
  Chart as ChartJS,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
} from 'chart.js';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import { Bar } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend, ChartDataLabels);

const getVar = (name, fallback) =>
  getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim() || fallback;

const AdStatusByBrandChart = ({ data }) => {
  const brandCodes = Object.keys(data);
  const statuses = ['ready', 'pending', 'approved', 'edit requested'];
  const colors = [
    getVar('--accent-color', '#60a5fa'),
    getVar('--pending-color', '#fbbf24'),
    getVar('--approve-color', '#34d399'),
    getVar('--edit-color', '#f87171'),
  ];
  const chartData = {
    labels: brandCodes,
    datasets: statuses.map((status, idx) => ({
      label: status,
      data: brandCodes.map((b) => data[b][status] || 0),
      backgroundColor: colors[idx],
    })),
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      datalabels: { color: '#fff' },
    },
    scales: { x: { stacked: true }, y: { stacked: true } },
  };

  return (
    <div className="h-64 max-w-md mx-auto">
      <Bar data={chartData} options={options} />
    </div>
  );
};

export default AdStatusByBrandChart;
