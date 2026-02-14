import React, { useState } from "react";

export type AgentStatus = "active" | "idle" | "busy";

export interface Agent {
  slug: string;
  name: string;
  color: string;
  description: string;
  status: AgentStatus;
}

const AGENTS: Agent[] = [
  { slug: "kairos", name: "Kairos", color: "#ec4899", description: "Time optimization", status: "active" },
  { slug: "sentinel", name: "Sentinel", color: "#8b5cf6", description: "Monitoring", status: "idle" },
  { slug: "oracle", name: "Oracle", color: "#3b82f6", description: "Insights", status: "busy" },
  { slug: "tempo", name: "Tempo", color: "#10b981", description: "Scheduling", status: "active" },
  { slug: "nexus", name: "Nexus", color: "#f59e0b", description: "Integration", status: "idle" },
  { slug: "polaris", name: "Polaris", color: "#06b6d4", description: "Navigation", status: "active" },
];

export interface AgentWorkersSidebarProps {
  onSelectAgent: (agentSlug: string) => void;
  selectedAgent?: string;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

const AgentStatusBadge: React.FC<{ status: AgentStatus }> = ({ status }) => {
  return (
    <span className={`agent-status agent-status--${status}`}>
      {status}
    </span>
  );
};

const AgentIndicator: React.FC<{ color: string; status: AgentStatus }> = ({ color, status }) => {
  return (
    <span
      className={`agent-indicator${status === "active" ? " agent-indicator--pulse" : ""}`}
      style={{ backgroundColor: color }}
      aria-hidden="true"
    />
  );
};

export const AgentWorkersSidebar: React.FC<AgentWorkersSidebarProps> = ({
  onSelectAgent,
  selectedAgent,
  isCollapsed = false,
  onToggleCollapse,
}) => {
  const [internalCollapsed, setInternalCollapsed] = useState(false);

  const collapsed = isCollapsed !== undefined ? isCollapsed : internalCollapsed;

  const handleToggle = () => {
    if (onToggleCollapse) {
      onToggleCollapse();
    } else {
      setInternalCollapsed((prev) => !prev);
    }
  };

  return (
    <div className="agent-workers-sidebar">
      <button
        type="button"
        className="agent-workers-header"
        onClick={handleToggle}
        aria-expanded={!collapsed}
      >
        <span className="agent-workers-header-icon" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
          </svg>
        </span>
        <span className="agent-workers-header-title">AI Agents</span>
        <span className="agent-workers-header-count">{AGENTS.length}</span>
        <span className="agent-workers-header-chevron" aria-hidden="true">
          {collapsed ? "+" : "-"}
        </span>
      </button>

      {!collapsed && (
        <ul className="agent-workers-list">
          {AGENTS.map((agent) => {
            const isSelected = selectedAgent === agent.slug;
            return (
              <li key={agent.slug}>
                <button
                  type="button"
                  className={`agent-worker-item${isSelected ? " agent-worker-item--selected" : ""}`}
                  onClick={() => onSelectAgent(agent.slug)}
                  aria-current={isSelected ? "true" : undefined}
                >
                  <AgentIndicator color={agent.color} status={agent.status} />
                  <div className="agent-worker-info">
                    <span className="agent-worker-name">{agent.name}</span>
                    <span className="agent-worker-description">{agent.description}</span>
                  </div>
                  <AgentStatusBadge status={agent.status} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default AgentWorkersSidebar;
