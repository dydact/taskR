import React from "react";
import { Line } from "react-chartjs-2";
import type { VelocitySeries } from "../../../types/dashboard";

type VelocityLineProps = {
  series: VelocitySeries;
  color: string;
};

export const VelocityLine: React.FC<VelocityLineProps> = ({ series, color }) => {
  if (series.points.length === 0) {
    return <p className="widget-empty">No recent completions.</p>;
  }

  const labels = series.points.map((point) => new Date(point.date).toLocaleDateString());
  const dataPoints = series.points.map((point) => point.completed);

  const data = {
    labels,
    datasets: [
      {
        label: "Completed",
        data: dataPoints,
        borderColor: color,
        backgroundColor: color,
        tension: 0.25,
        fill: false
      }
    ]
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false }
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
