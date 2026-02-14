import React, { type ReactNode } from "react";
import "./placeholder-views.css";

type PlaceholderViewProps = {
  title: string;
  description: string;
  ctaLabel?: string;
  onCtaClick?: () => void;
  icon?: ReactNode;
  preview?: ReactNode;
  variant?: "default" | "gantt" | "inbox" | "goals" | "docs" | "dedicated";
};

export const PlaceholderView: React.FC<PlaceholderViewProps> = ({
  title,
  description,
  ctaLabel,
  onCtaClick,
  icon,
  preview,
  variant = "default"
}) => {
  return (
    <section className={`placeholder-view placeholder-view--${variant}`}>
      <div className="placeholder-view__glow" />
      <div className="placeholder-view__content">
        <div className="placeholder-view__icon-wrap">
          {icon || (
            <svg
              className="placeholder-view__icon-default"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z"
              />
            </svg>
          )}
        </div>
        <h2 className="placeholder-view__title">{title}</h2>
        <p className="placeholder-view__desc">{description}</p>
        {ctaLabel && onCtaClick && (
          <button onClick={onCtaClick} className="placeholder-view__cta">
            {ctaLabel}
          </button>
        )}
      </div>
      {preview && <div className="placeholder-view__preview">{preview}</div>}
    </section>
  );
};
