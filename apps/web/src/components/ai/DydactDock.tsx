import React from "react";

type DockItem = {
  id: string;
  label: string;
  icon: string;
  action: () => void;
  isActive?: boolean;
};

type DydactDockProps = {
  onOpenChat?: () => void;
  onOpenInsights?: () => void;
  onOpenAgents?: () => void;
  className?: string;
};

export const DydactDock: React.FC<DydactDockProps> = ({
  onOpenChat,
  onOpenInsights,
  onOpenAgents,
  className = ""
}) => {
  const [isExpanded, setIsExpanded] = React.useState(false);

  const dockItems: DockItem[] = [
    {
      id: "chat",
      label: "Dydact Chat",
      icon: "\u2328",
      action: () => onOpenChat?.()
    },
    {
      id: "insights",
      label: "AI Insights",
      icon: "\u2606",
      action: () => onOpenInsights?.()
    },
    {
      id: "agents",
      label: "Agent Hub",
      icon: "\u2699",
      action: () => onOpenAgents?.()
    }
  ];

  return (
    <div className={`dydact-dock ${isExpanded ? "expanded" : ""} ${className}`.trim()}>
      <button
        type="button"
        className="dock-toggle"
        onClick={() => setIsExpanded(!isExpanded)}
        aria-label={isExpanded ? "Collapse Dydact dock" : "Expand Dydact dock"}
        aria-expanded={isExpanded}
      >
        <span className="dock-logo">\u2726</span>
      </button>
      {isExpanded && (
        <nav className="dock-items" aria-label="Dydact AI tools">
          {dockItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`dock-item${item.isActive ? " active" : ""}`}
              onClick={item.action}
              title={item.label}
            >
              <span className="dock-item-icon">{item.icon}</span>
              <span className="dock-item-label">{item.label}</span>
            </button>
          ))}
        </nav>
      )}
    </div>
  );
};

export default DydactDock;
