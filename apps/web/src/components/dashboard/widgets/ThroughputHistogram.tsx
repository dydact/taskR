import React from "react";
import { Bar } from "react-chartjs-2";
import type { ThroughputHistogram } from "../../../types/dashboard";

type ThroughputHistogramProps = {
  histogram: ThroughputHistogram;
  color: string;
};

const formatLabel = (isoDate: string) => {
  const date = new Date(isoDate);
  const month = date.toLocaleString(undefined, { month: "short" });
  const day = date.getDate();
  return `Week of ${month} ${day}`;
};

export const ThroughputHistogram: React.FC<ThroughputHistogramProps> = ({ histogram, color }) => {
  if (histogram.buckets.length === 0) {
    return <p className="widget-empty">Throughput data will appear once tasks complete.</p>;
  }

  const labels = histogram.buckets.map((bucket) => formatLabel(bucket.week_start));
  const counts = histogram.buckets.map((bucket) => bucket.completed);

  const data = {
    labels,
    datasets: [
      {
        label: "Completed",
        data: counts,
        backgroundColor: color,
        borderRadius: 6,
        maxBarThickness: 32
      }
    ]
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          title: (items: Array<{ raw: number; label: string }>) => items[0]?.label ?? ""
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: { precision: 0 }
      }
    }
  };

  return (
    <div className="widget-chart">
      <Bar data={data} options={options} />
    </div>
  );
};
