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

const AverageReviewTimeChart = ({ data }) => {
  const groups = Object.keys(data);
  const designers = [...new Set(Object.values(data).map((d) => d.designer))];
  const chartData = {
    labels: groups,
    datasets: designers.map((des, idx) => ({
      label: des,
      data: groups.map((g) => data[g].times[des] || 0),
      backgroundColor: [`#60a5fa`, `#34d399`, `#fbbf24`, `#f87171`][idx % 4],
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
