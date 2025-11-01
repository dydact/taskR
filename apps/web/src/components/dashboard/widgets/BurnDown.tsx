import React from "react";
import { Line } from "react-chartjs-2";
import type { BurnDownSeries } from "../../../types/dashboard";

type BurnDownProps = {
  series: BurnDownSeries;
  colors: {
    planned: string;
    completed: string;
    remaining: string;
  };
};

export const BurnDown: React.FC<BurnDownProps> = ({ series, colors }) => {
  if (series.points.length === 0) {
    return <p className="widget-empty">No sprint scope recorded.</p>;
  }

  const labels = series.points.map((point) => new Date(point.date).toLocaleDateString());
  const planned = series.points.map((point) => point.planned);
  const completed = series.points.map((point) => point.completed);
  const remaining = series.points.map((point) => point.remaining);

  const data = {
    labels,
    datasets: [
      {
        label: "Planned",
        data: planned,
        borderColor: colors.planned,
        backgroundColor: colors.planned,
        borderDash: [8, 6],
        fill: false,
        tension: 0.2
      },
      {
        label: "Completed",
        data: completed,
        borderColor: colors.completed,
        backgroundColor: colors.completed,
        tension: 0.25,
        fill: false
      },
      {
        label: "Remaining",
        data: remaining,
        borderColor: colors.remaining,
        backgroundColor: colors.remaining,
        fill: true,
        tension: 0.15,
        pointRadius: 0
      }
    ]
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: "bottom" as const },
      tooltip: {
        mode: "index" as const,
        intersect: false
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
      <Line data={data} options={options} />
    </div>
  );
};
