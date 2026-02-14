import React from "react";

type MemPODSEntry = {
  id: string;
  category: "memory" | "pattern" | "objective" | "directive" | "state";
  label: string;
  value: string;
  confidence?: number;
  updatedAt?: string;
};

type MemPODSContextPanelProps = {
  taskId: string;
  className?: string;
};

const getCategoryIcon = (category: MemPODSEntry["category"]) => {
  switch (category) {
    case "memory":
      return "\u2B50"; // star
    case "pattern":
      return "\u2248"; // approx
    case "objective":
      return "\u25CE"; // target
    case "directive":
      return "\u27A4"; // arrow
    case "state":
      return "\u25A0"; // square
    default:
      return "\u2022";
  }
};

const MOCK_CONTEXT: MemPODSEntry[] = [
  {
    id: "1",
    category: "memory",
    label: "Related context",
    value: "Similar task completed last week with 2-day turnaround.",
    confidence: 0.85
  },
  {
    id: "2",
    category: "pattern",
    label: "Work pattern",
    value: "User typically completes reviews in morning sessions.",
    confidence: 0.92
  },
  {
    id: "3",
    category: "objective",
    label: "Sprint goal",
    value: "Focus on clearing backlog before end of week.",
    confidence: 0.78
  }
];

export const MemPODSContextPanel: React.FC<MemPODSContextPanelProps> = ({
  taskId,
  className = ""
}) => {
  const [isExpanded, setIsExpanded] = React.useState(false);

  // In production, fetch context based on taskId
  const contextEntries = MOCK_CONTEXT;

  if (contextEntries.length === 0) {
    return null;
  }

  return (
    <div className={`mempods-panel ${className}`.trim()}>
      <button
        type="button"
        className="mempods-header"
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
      >
        <span className="mempods-icon">\u2B21</span>
        <span className="mempods-title">MemPODS Context</span>
        <span className="mempods-count">{contextEntries.length}</span>
        <span className="mempods-chevron">{isExpanded ? "\u25BC" : "\u25B6"}</span>
      </button>
      {isExpanded && (
        <ul className="mempods-entries">
          {contextEntries.map((entry) => (
            <li key={entry.id} className={`mempods-entry category-${entry.category}`}>
              <span className="entry-icon">{getCategoryIcon(entry.category)}</span>
              <div className="entry-content">
                <span className="entry-label">{entry.label}</span>
                <span className="entry-value">{entry.value}</span>
                {entry.confidence !== undefined && (
                  <span className="entry-confidence">
                    {Math.round(entry.confidence * 100)}% confidence
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default MemPODSContextPanel;
