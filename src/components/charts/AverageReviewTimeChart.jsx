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

const AverageReviewTimeChart = ({ data }) => {
  const groups = Object.keys(data);
  const designers = [...new Set(Object.values(data).map((d) => d.designer))];
  const colors = [
    getVar('--accent-color', '#60a5fa'),
    getVar('--approve-color', '#34d399'),
    getVar('--edit-color', '#fbbf24'),
    getVar('--reject-color', '#f87171'),
  ];
  const chartData = {
    labels: groups,
    datasets: designers.map((des, idx) => ({
      label: des,
      data: groups.map((g) => data[g].times[des] || 0),
      backgroundColor: colors[idx % colors.length],
    })),
  };

  const options = {
    responsive: true,
    indexAxis: 'y',
    plugins: { datalabels: { anchor: 'end', align: 'right' } },
    scales: { x: { stacked: true }, y: { stacked: true } },
  };

  return <Bar data={chartData} options={options} />;
};

export default AverageReviewTimeChart;
