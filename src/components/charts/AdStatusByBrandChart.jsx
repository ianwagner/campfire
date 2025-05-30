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

const AdStatusByBrandChart = ({ data }) => {
  const brandCodes = Object.keys(data);
  const statuses = ['ready', 'pending', 'approved', 'edit requested'];
  const chartData = {
    labels: brandCodes,
    datasets: statuses.map((status, idx) => ({
      label: status,
      data: brandCodes.map((b) => data[b][status] || 0),
      backgroundColor: [`#60a5fa`, `#fbbf24`, `#34d399`, `#f87171`][idx],
    })),
  };

  const options = {
    responsive: true,
    plugins: {
      datalabels: { color: '#fff' },
    },
    scales: { x: { stacked: true }, y: { stacked: true } },
  };

  return <Bar data={chartData} options={options} />;
};

export default AdStatusByBrandChart;
