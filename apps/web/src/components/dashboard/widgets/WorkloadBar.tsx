import React from "react";
import { Bar } from "react-chartjs-2";
import type { WorkloadSummary } from "../../../types/dashboard";

type WorkloadBarProps = {
  summary: WorkloadSummary;
  colors: string[];
};

export const WorkloadBar: React.FC<WorkloadBarProps> = ({ summary, colors }) => {
  if (summary.entries.length === 0) {
    return <p className="widget-empty">No workload recorded.</p>;
  }

  const labels = summary.entries.map((entry) => entry.assignee_email ?? "Unassigned");
  const taskCounts = summary.entries.map((entry) => entry.task_count);
  const minutes = summary.entries.map((entry) => entry.total_minutes);

  const data = {
    labels,
    datasets: [
      {
        label: "Tasks",
        data: taskCounts,
        backgroundColor: colors[0],
        borderRadius: 8,
        maxBarThickness: 36
      },
      {
        label: "Minutes (line)",
        data: minutes,
        type: "line" as const,
        borderColor: colors[1],
        backgroundColor: colors[1],
        borderWidth: 2,
        tension: 0.3,
        yAxisID: "y1",
        pointRadius: 3
      }
    ]
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: "bottom" as const }
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: { precision: 0 }
      },
      y1: {
        beginAtZero: true,
        position: "right" as const,
        grid: { drawOnChartArea: false }
      }
    }
  };

  return (
    <div className="widget-chart">
      <Bar data={data} options={options} />
    </div>
  );
};
