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

const CommentFrequencyHeatmap = ({ data }) => {
  const reviewers = Object.keys(data);
  const brands = [...new Set(reviewers.flatMap((r) => Object.keys(data[r])))];
  const chartData = {
    labels: reviewers,
    datasets: brands.map((brand, idx) => ({
      label: brand,
      data: reviewers.map((r) => data[r][brand] || 0),
      backgroundColor: `rgba(59,130,246,${0.3 + idx / brands.length})`,
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
