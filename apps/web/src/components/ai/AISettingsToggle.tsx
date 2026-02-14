import React from "react";

type AISettingsToggleProps = {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  className?: string;
};

export const AISettingsToggle: React.FC<AISettingsToggleProps> = ({
  enabled,
  onChange,
  className = ""
}) => {
  return (
    <div className={`ai-settings-toggle ${className}`.trim()}>
      <label className="toggle-wrapper">
        <span className="toggle-label">
          <span className="toggle-icon">\u2728</span>
          Dydact AI Enhancements
        </span>
        <span className="toggle-description">
          Enable AI-powered suggestions, agent assignment, and contextual insights
        </span>
        <div className="toggle-control">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => onChange(e.target.checked)}
            className="toggle-input"
          />
          <span className="toggle-track">
            <span className="toggle-thumb" />
          </span>
        </div>
      </label>
    </div>
  );
};

export default AISettingsToggle;
