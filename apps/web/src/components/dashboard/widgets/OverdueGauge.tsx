import React from "react";
import type { OverdueSummary } from "../../../types/dashboard";

type OverdueGaugeProps = {
  summary: OverdueSummary;
};

export const OverdueGauge: React.FC<OverdueGaugeProps> = ({ summary }) => {
  const totalMonitored = summary.total_overdue + summary.due_soon;
  const overduePercent = totalMonitored > 0 ? summary.total_overdue / totalMonitored : 0;
  const gaugeAngle = Math.min(360 * overduePercent, 360);

  return (
    <div className="overdue-gauge">
      <div
        className="overdue-gauge__dial"
        style={{ background: `conic-gradient(var(--plane-danger) ${gaugeAngle}deg, var(--plane-surface-muted) 0deg)` }}
      >
        <div className="overdue-gauge__center">
          <span className="overdue-gauge__value">{summary.total_overdue}</span>
          <span className="overdue-gauge__caption">Overdue</span>
        </div>
      </div>
      <div className="overdue-gauge__details">
        <div>
          <span className="overdue-gauge__label">Due Soon</span>
          <span className="overdue-gauge__number">{summary.due_soon}</span>
        </div>
        <div>
          <span className="overdue-gauge__label">Severe</span>
          <span className="overdue-gauge__number">{summary.severe_overdue}</span>
        </div>
        <div>
          <span className="overdue-gauge__label">Avg Days Overdue</span>
          <span className="overdue-gauge__number">
            {summary.avg_days_overdue != null ? summary.avg_days_overdue.toFixed(1) : "–"}
          </span>
        </div>
      </div>
    </div>
  );
};
