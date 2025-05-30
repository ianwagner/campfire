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

const AssetUploadsChart = ({ data }) => {
  const designers = Object.keys(data);
  const dates = [...new Set(designers.flatMap((d) => Object.keys(data[d])))].sort();
  const chartData = {
    labels: dates,
    datasets: designers.map((des, idx) => ({
      label: des,
      data: dates.map((dt) => data[des][dt] || 0),
      fill: false,
      borderColor: [`#60a5fa`, `#34d399`, `#fbbf24`, `#f87171`][idx % 4],
    })),
  };

  const options = {
    responsive: true,
    parsing: false,
    plugins: {
      legend: { position: 'bottom' },
      datalabels: { display: false },
    },
    scales: {
      x: { type: 'time', time: { unit: 'day' } },
    },
  };

  return <Line data={chartData} options={options} />;
};

export default AssetUploadsChart;
