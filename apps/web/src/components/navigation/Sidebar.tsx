import React, { useEffect, useMemo, useState } from "react";
import { useShell } from "../../context/ShellContext";
import { useAIFeatures } from "../../hooks/useAIFeatures";
import type { NavigationFolder, NavigationList } from "../../types/navigation";
import { AgentWorkersSidebar } from "../agents";

type SidebarProps = {
  selectedListId: string | null;
  onSelectSpace(spaceId: string): void;
  onSelectList(spaceId: string, listId: string): void;
  listCounts?: Record<string, number>;
  spaceCounts?: Record<string, number>;
  selectedAgent?: string;
  onSelectAgent?: (agentSlug: string) => void;
};

const FolderSection: React.FC<{
  folder: NavigationFolder;
  selectedListId: string | null;
  onSelectList(list: NavigationList): void;
  listCounts?: Record<string, number>;
}> = ({ folder, selectedListId, onSelectList, listCounts }) => {
  if (folder.lists.length === 0) {
    return null;
  }
  return (
    <div className="sidebar-folder">
      <div className="sidebar-folder-name">{folder.name}</div>
      <ul className="sidebar-list">
        {folder.lists.map((list) => (
          <li key={list.list_id}>
            <button
              type="button"
              className={`sidebar-list-item${selectedListId === list.list_id ? " active" : ""}`}
              onClick={() => onSelectList(list)}
            >
              <span className="sidebar-list-indicator" aria-hidden="true" />
              <span className="sidebar-list-name">{list.name}</span>
              {listCounts?.[list.list_id] !== undefined ? (
                <span className="sidebar-list-badge">{listCounts[list.list_id]}</span>
              ) : null}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};

const RootListSection: React.FC<{
  lists: NavigationList[];
  selectedListId: string | null;
  onSelectList(list: NavigationList): void;
  listCounts?: Record<string, number>;
}> = ({ lists, selectedListId, onSelectList, listCounts }) => {
  if (lists.length === 0) {
    return null;
  }
  return (
    <ul className="sidebar-list">
      {lists.map((list) => (
        <li key={list.list_id}>
          <button
            type="button"
            className={`sidebar-list-item${selectedListId === list.list_id ? " active" : ""}`}
            onClick={() => onSelectList(list)}
          >
            <span className="sidebar-list-indicator" aria-hidden="true" />
            <span className="sidebar-list-name">{list.name}</span>
            {listCounts?.[list.list_id] !== undefined ? (
              <span className="sidebar-list-badge">{listCounts[list.list_id]}</span>
            ) : null}
          </button>
        </li>
      ))}
    </ul>
  );
};

export const Sidebar: React.FC<SidebarProps> = ({
  selectedListId,
  onSelectSpace,
  onSelectList,
  listCounts,
  spaceCounts,
  selectedAgent,
  onSelectAgent
}) => {
  const { spaces, activeSpaceId, setActiveSpace, navigation } = useShell();
  const { enabled: aiEnabled } = useAIFeatures();
  const [expandedSpaces, setExpandedSpaces] = useState<Set<string>>(new Set());
  const [agentsCollapsed, setAgentsCollapsed] = useState(false);

  useEffect(() => {
    if (activeSpaceId) {
      setExpandedSpaces((prev) => {
        const next = new Set(prev);
        next.add(activeSpaceId);
        return next;
      });
    }
  }, [activeSpaceId]);

  const activeNavigation = useMemo(() => {
    if (!navigation) return null;
    if (!activeSpaceId) return null;
    if (navigation.space_id === activeSpaceId) return navigation;
    return null;
  }, [navigation, activeSpaceId]);

  const toggleSpace = (spaceId: string) => {
    setExpandedSpaces((prev) => {
      const next = new Set(prev);
      if (next.has(spaceId)) {
        next.delete(spaceId);
      } else {
        next.add(spaceId);
      }
      return next;
    });
  };

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <h2>Spaces</h2>
      </div>
      <nav className="sidebar-nav" aria-label="Workspace navigation">
        {spaces.map((space) => {
          const isActiveSpace = activeSpaceId === space.spaceId || activeSpaceId === space.id;
          const spaceId = space.spaceId;
          const isExpanded = expandedSpaces.has(spaceId);
          const hasNavigation =
            isActiveSpace && !!activeNavigation && (activeNavigation.root_lists.length > 0 || activeNavigation.folders.length > 0);
          const badge = spaceCounts?.[spaceId];
          const spaceAvatar = space.name ? space.name.charAt(0).toUpperCase() : "•";
          return (
            <div
              key={spaceId}
              className={`sidebar-space${isActiveSpace ? " active" : ""}${isExpanded ? " expanded" : ""}`}
            >
              <button
                type="button"
                className="sidebar-space-button"
                onClick={() => {
                  setActiveSpace(spaceId);
                  onSelectSpace(spaceId);
                  if (hasNavigation) {
                    toggleSpace(spaceId);
                  }
                }}
              >
                <span className="sidebar-space-icon" aria-hidden="true">
                  {spaceAvatar}
                </span>
                <div className="sidebar-space-label">
                  <span className="sidebar-space-name">{space.name}</span>
                  {badge ? <span className="sidebar-space-badge">{badge}</span> : null}
                </div>
                <span className="sidebar-space-indicator" aria-hidden="true">
                  {hasNavigation ? (isExpanded ? "▾" : "▸") : "•"}
                </span>
              </button>
              {isExpanded && hasNavigation && activeNavigation && (
                <div className="sidebar-space-children">
                  <RootListSection
                    lists={activeNavigation.root_lists}
                    selectedListId={selectedListId}
                    onSelectList={(list) => onSelectList(spaceId, list.list_id)}
                    listCounts={listCounts}
                  />
                  {activeNavigation.folders.map((folder) => (
                    <FolderSection
                      key={folder.folder_id}
                      folder={folder}
                      selectedListId={selectedListId}
                      onSelectList={(list) => onSelectList(spaceId, list.list_id)}
                      listCounts={listCounts}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>
      {aiEnabled && onSelectAgent && (
        <AgentWorkersSidebar
          selectedAgent={selectedAgent}
          onSelectAgent={onSelectAgent}
          isCollapsed={agentsCollapsed}
          onToggleCollapse={() => setAgentsCollapsed(!agentsCollapsed)}
        />
      )}
    </div>
  );
};
