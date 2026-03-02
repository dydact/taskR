import React from "react";

export type AgentAssignmentStatus = "idle" | "working" | "success" | "error" | "waiting";

export interface AgentAssignmentBadgeProps {
  name: string;
  status: AgentAssignmentStatus;
  /** Optional service color override (hex or CSS color) */
  serviceColor?: string;
}

const STATUS_CONFIG: Record<AgentAssignmentStatus, { label: string; dotColor: string; bg: string; border: string; text: string }> = {
  idle: {
    label: "Idle",
    dotColor: "var(--plane-muted, #94a3b8)",
    bg: "rgba(148, 163, 184, 0.12)",
    border: "rgba(148, 163, 184, 0.2)",
    text: "var(--plane-muted, #94a3b8)",
  },
  working: {
    label: "Working",
    dotColor: "var(--plane-info, #38bdf8)",
    bg: "rgba(56, 189, 248, 0.14)",
    border: "rgba(56, 189, 248, 0.3)",
    text: "var(--plane-info, #38bdf8)",
  },
  success: {
    label: "Success",
    dotColor: "var(--plane-success, #4ad0a7)",
    bg: "rgba(74, 208, 167, 0.14)",
    border: "rgba(74, 208, 167, 0.3)",
    text: "var(--plane-success, #4ad0a7)",
  },
  error: {
    label: "Error",
    dotColor: "var(--plane-danger, #ff6b6b)",
    bg: "rgba(255, 107, 107, 0.14)",
    border: "rgba(255, 107, 107, 0.3)",
    text: "var(--plane-danger, #ff6b6b)",
  },
  waiting: {
    label: "Waiting",
    dotColor: "var(--plane-warning, #f7b23b)",
    bg: "rgba(247, 178, 59, 0.14)",
    border: "rgba(247, 178, 59, 0.3)",
    text: "var(--plane-warning, #f7b23b)",
  },
};

export const AgentAssignmentBadge: React.FC<AgentAssignmentBadgeProps> = ({
  name,
  status,
  serviceColor,
}) => {
  const config = STATUS_CONFIG[status];

  return (
    <span
      className="agent-assignment-badge"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        padding: "2px 10px 2px 8px",
        fontSize: "11px",
        fontWeight: 600,
        borderRadius: "999px",
        textTransform: "uppercase",
        letterSpacing: "0.04em",
        lineHeight: "20px",
        background: config.bg,
        border: `1px solid ${config.border}`,
        color: config.text,
      }}
    >
      <span
        className={status === "working" ? "agent-assignment-dot--pulse" : undefined}
        style={{
          display: "inline-block",
          width: "7px",
          height: "7px",
          borderRadius: "999px",
          backgroundColor: serviceColor ?? config.dotColor,
          flexShrink: 0,
        }}
        aria-hidden="true"
      />
      @{name}
    </span>
  );
};

export default AgentAssignmentBadge;
