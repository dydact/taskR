import React from "react";
import type { CycleEfficiencyMetrics } from "../../../types/dashboard";

type CycleEfficiencyProps = {
  metrics: CycleEfficiencyMetrics;
};

export const CycleEfficiency: React.FC<CycleEfficiencyProps> = ({ metrics }) => {
  if (metrics.sample_size === 0) {
    return <p className="widget-empty">No completed tasks in this window.</p>;
  }

  const items: Array<{ label: string; value: string }> = [
    { label: "Sample Size", value: metrics.sample_size.toString() },
    { label: "Avg Cycle (hrs)", value: metrics.avg_cycle_hours.toFixed(1) },
    { label: "Active (hrs)", value: metrics.avg_active_hours.toFixed(1) },
    { label: "Waiting (hrs)", value: metrics.avg_wait_hours.toFixed(1) }
  ];

  return (
    <div className="cycle-efficiency">
      <div className="cycle-efficiency__summary">
        <div className="cycle-efficiency__gauge">
          <span className="cycle-efficiency__value">{metrics.efficiency_percent.toFixed(1)}%</span>
          <span className="cycle-efficiency__label">Efficiency</span>
        </div>
        <div className="cycle-efficiency__details">
          {items.map((item) => (
            <div key={item.label} className="cycle-efficiency__item">
              <span className="cycle-efficiency__item-label">{item.label}</span>
              <span className="cycle-efficiency__item-value">{item.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
