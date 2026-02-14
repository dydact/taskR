import React from "react";

type AgentAssignmentBadgeProps = {
  taskId: string;
  onAssign?: (taskId: string, agentId: string) => void;
  className?: string;
};

const AVAILABLE_AGENTS = [
  { id: "auto", name: "Auto-assign", icon: "\u2699" },
  { id: "research", name: "Research Agent", icon: "\u2315" },
  { id: "writing", name: "Writing Agent", icon: "\u270E" },
  { id: "analysis", name: "Analysis Agent", icon: "\u2261" }
];

export const AgentAssignmentBadge: React.FC<AgentAssignmentBadgeProps> = ({
  taskId,
  onAssign,
  className = ""
}) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const [selectedAgent, setSelectedAgent] = React.useState<string | null>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const handleSelectAgent = (agentId: string) => {
    setSelectedAgent(agentId);
    setIsOpen(false);
    onAssign?.(taskId, agentId);
  };

  const selected = AVAILABLE_AGENTS.find((agent) => agent.id === selectedAgent);

  return (
    <div className={`agent-assignment ${className}`.trim()} ref={menuRef}>
      <button
        type="button"
        className="agent-assignment-trigger"
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        title="Assign AI agent"
      >
        <span className="agent-icon">{selected?.icon || "\u2699"}</span>
        <span className="agent-label">{selected?.name || "AI Agent"}</span>
      </button>
      {isOpen && (
        <ul className="agent-assignment-menu" role="listbox">
          {AVAILABLE_AGENTS.map((agent) => (
            <li
              key={agent.id}
              role="option"
              aria-selected={selectedAgent === agent.id}
              className={`agent-option${selectedAgent === agent.id ? " selected" : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                handleSelectAgent(agent.id);
              }}
            >
              <span className="agent-option-icon">{agent.icon}</span>
              <span className="agent-option-name">{agent.name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default AgentAssignmentBadge;
