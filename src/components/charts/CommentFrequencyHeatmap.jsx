import React from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
} from 'chart.js';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import { Bar } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, ChartDataLabels);

const getVar = (name, fallback) =>
  getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim() || fallback;

const hexToRgb = (hex) => {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const int = parseInt(h, 16);
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  return `${r},${g},${b}`;
};

const CommentFrequencyHeatmap = ({ data }) => {
  const reviewers = Object.keys(data);
  const brands = [...new Set(reviewers.flatMap((r) => Object.keys(data[r])))];
  const base = getVar('--accent-color', '#3b82f6');
  const chartData = {
    labels: reviewers,
    datasets: brands.map((brand, idx) => ({
      label: brand,
      data: reviewers.map((r) => data[r][brand] || 0),
      backgroundColor: `rgba(${hexToRgb(base)},${0.3 + idx / brands.length})`,
    })),
  };

  const options = {
    responsive: true,
    plugins: {
      datalabels: { color: '#fff' },
      legend: { position: 'bottom' },
    },
    scales: { x: { stacked: true }, y: { stacked: true } },
  };

  return <Bar data={chartData} options={options} />;
};

export default CommentFrequencyHeatmap;
