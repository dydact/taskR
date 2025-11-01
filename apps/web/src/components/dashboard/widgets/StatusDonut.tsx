import React from "react";
import { Doughnut } from "react-chartjs-2";
import type { StatusSummary } from "../../../types/dashboard";

type StatusDonutProps = {
  summary: StatusSummary;
  colors: string[];
};

export const StatusDonut: React.FC<StatusDonutProps> = ({ summary, colors }) => {
  if (summary.entries.length === 0) {
    return <p className="widget-empty">No task activity yet.</p>;
  }

  const labels = summary.entries.map((entry) => entry.status || "Unknown");
  const counts = summary.entries.map((entry) => entry.count);

  const data = {
    labels,
    datasets: [
      {
        data: counts,
        backgroundColor: labels.map((_, index) => colors[index % colors.length]),
        borderWidth: 0
      }
    ]
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: "bottom" as const },
      tooltip: {
        callbacks: {
          label: (context: { label: string; formattedValue: string }) =>
            `${context.label}: ${context.formattedValue}`
        }
      }
    }
  };

  return (
    <div className="widget-chart widget-chart--square">
      <Doughnut data={data} options={options} />
    </div>
  );
};
