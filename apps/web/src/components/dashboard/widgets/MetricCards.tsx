import React from "react";
import type { MetricCard } from "../../../types/dashboard";

type MetricCardsProps = {
  cards: MetricCard[];
};

export const MetricCards: React.FC<MetricCardsProps> = ({ cards }) => {
  if (cards.length === 0) {
    return <p className="widget-empty">No summary metrics available.</p>;
  }

  return (
    <div className="metric-cards">
      {cards.map((card) => (
        <div key={card.key} className="metric-card">
          <span className="metric-card__label">{card.label}</span>
          <span className="metric-card__value">
            {Number.isFinite(card.value) ? card.value : 0}
          </span>
          {card.delta != null && (
            <span className={`metric-card__delta ${card.delta >= 0 ? "delta-up" : "delta-down"}`}>
              {card.delta > 0 ? "▲" : card.delta < 0 ? "▼" : "•"} {Math.abs(card.delta).toFixed(1)}
            </span>
          )}
          {card.trend && <span className="metric-card__trend">{card.trend}</span>}
        </div>
      ))}
    </div>
  );
};
