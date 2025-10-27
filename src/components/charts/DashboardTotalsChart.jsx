import React, { useMemo } from 'react';
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

const getCssVar = (name, fallback) => {
  if (typeof window === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name);
  return value ? value.trim() || fallback : fallback;
};

const DashboardTotalsChart = ({ entries = [], briefOnly = false }) => {
  const chartConfig = useMemo(() => {
    if (!entries || entries.length === 0) {
      return null;
    }

    const months = entries.map((entry) => entry.month).filter(Boolean);
    if (months.length === 0) {
      return null;
    }

    const metricKeys = ['contracted', 'briefed', 'delivered'];
    if (!briefOnly) {
      metricKeys.push('inRevisions', 'approved', 'rejected');
    }

    const colors = {
      contracted: getCssVar('--accent-color', '#ea580c'),
      briefed: getCssVar('--edit-color', '#ffb700'),
      delivered: getCssVar('--approve-color', '#00ab47'),
      inRevisions: getCssVar('--edit-color', '#ffb700'),
      approved: getCssVar('--approve-color', '#00ab47'),
      rejected: getCssVar('--reject-color', '#ff5c5c'),
    };

    const datasetLabels = {
      contracted: 'Contracted',
      briefed: briefOnly ? 'Briefs submitted' : 'Briefed',
      delivered: 'Delivered',
      inRevisions: 'In Revisions',
      approved: 'Approved',
      rejected: 'Rejected',
    };

    const datasets = metricKeys.map((key) => ({
      label: datasetLabels[key],
      data: entries.map((entry) => {
        const metric = entry.metrics?.[key];
        if (!metric) return 0;
        if (metric.hasData) return metric.total;
        if (metric.hasUnknown) return null;
        return 0;
      }),
      borderColor: colors[key],
      backgroundColor: colors[key],
      tension: 0.35,
      pointRadius: 3,
      pointHoverRadius: 4,
      spanGaps: true,
      borderDash: key === 'inRevisions' ? [6, 4] : undefined,
    }));

    const labels = months.map((month) => new Date(`${month}-01T00:00:00`));

    return {
      data: {
        labels,
        datasets,
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { intersect: false, mode: 'index' },
        scales: {
          x: {
            type: 'time',
            time: { unit: 'month' },
            grid: { display: false },
          },
          y: {
            beginAtZero: true,
            ticks: { precision: 0 },
          },
        },
        plugins: {
          legend: { position: 'bottom' },
          tooltip: {
            callbacks: {
              title: (tooltipItems) => {
                if (!tooltipItems || tooltipItems.length === 0) return '';
                const { label } = tooltipItems[0];
                if (!label) return '';
                const date = new Date(label);
                if (Number.isNaN(date.getTime())) return label;
                return date.toLocaleDateString(undefined, {
                  month: 'long',
                  year: 'numeric',
                });
              },
            },
          },
        },
      },
    };
  }, [entries, briefOnly]);

  if (!chartConfig) {
    return (
      <div className="flex h-80 w-full items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-white/60 text-sm text-gray-500 dark:border-[var(--border-color-default)] dark:bg-[var(--dark-sidebar)]/40 dark:text-gray-300">
        No data available for the selected range.
      </div>
    );
  }

  return (
    <div className="h-80 w-full">
      <Line data={chartConfig.data} options={chartConfig.options} />
    </div>
  );
};

export default DashboardTotalsChart;
