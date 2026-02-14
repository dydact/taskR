import React from "react";

type KairosSuggestion = {
  id: string;
  type: "focus" | "schedule" | "break" | "batch";
  title: string;
  description: string;
  priority: number;
  timeSlot?: string;
};

type KairosSuggestionsPanelProps = {
  className?: string;
};

const MOCK_SUGGESTIONS: KairosSuggestion[] = [
  {
    id: "1",
    type: "focus",
    title: "Deep work block",
    description: "Based on your patterns, now is a good time for focused work.",
    priority: 1,
    timeSlot: "9:00 AM - 11:00 AM"
  },
  {
    id: "2",
    type: "batch",
    title: "Batch similar tasks",
    description: "3 review tasks could be completed together.",
    priority: 2
  },
  {
    id: "3",
    type: "schedule",
    title: "Optimal meeting time",
    description: "Afternoon energy dip detected. Consider rescheduling.",
    priority: 3,
    timeSlot: "2:00 PM - 3:00 PM"
  }
];

const getSuggestionIcon = (type: KairosSuggestion["type"]) => {
  switch (type) {
    case "focus":
      return "\u25CE"; // target
    case "schedule":
      return "\u25F7"; // clock
    case "break":
      return "\u2615"; // coffee
    case "batch":
      return "\u2261"; // layers
    default:
      return "\u2022";
  }
};

export const KairosSuggestionsPanel: React.FC<KairosSuggestionsPanelProps> = ({
  className = ""
}) => {
  const [dismissed, setDismissed] = React.useState<Set<string>>(new Set());

  const visibleSuggestions = MOCK_SUGGESTIONS.filter(
    (suggestion) => !dismissed.has(suggestion.id)
  );

  const handleDismiss = (id: string) => {
    setDismissed((prev) => new Set(prev).add(id));
  };

  if (visibleSuggestions.length === 0) {
    return (
      <div className={`kairos-panel ${className}`.trim()}>
        <header className="kairos-panel-header">
          <span className="kairos-icon">\u2728</span>
          <h3>Kairos Suggestions</h3>
        </header>
        <p className="kairos-empty">All caught up! No suggestions right now.</p>
      </div>
    );
  }

  return (
    <div className={`kairos-panel ${className}`.trim()}>
      <header className="kairos-panel-header">
        <span className="kairos-icon">\u2728</span>
        <h3>Kairos Suggestions</h3>
      </header>
      <ul className="kairos-suggestions">
        {visibleSuggestions.map((suggestion) => (
          <li key={suggestion.id} className={`kairos-suggestion type-${suggestion.type}`}>
            <span className="suggestion-icon">{getSuggestionIcon(suggestion.type)}</span>
            <div className="suggestion-content">
              <strong className="suggestion-title">{suggestion.title}</strong>
              <p className="suggestion-description">{suggestion.description}</p>
              {suggestion.timeSlot && (
                <span className="suggestion-timeslot">{suggestion.timeSlot}</span>
              )}
            </div>
            <button
              type="button"
              className="suggestion-dismiss"
              onClick={() => handleDismiss(suggestion.id)}
              aria-label="Dismiss suggestion"
            >
              \u00D7
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default KairosSuggestionsPanel;
