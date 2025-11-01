import React from "react";

type WorkspaceShellProps = {
  sidebar: React.ReactNode;
  commandBar?: React.ReactNode;
  children: React.ReactNode;
};

export const WorkspaceShell: React.FC<WorkspaceShellProps> = ({ sidebar, commandBar, children }) => {
  return (
    <div className="workspace-shell">
      <aside className="workspace-sidebar">{sidebar}</aside>
      <div className="workspace-main">
        {commandBar && <header className="workspace-command-bar">{commandBar}</header>}
        <main className="workspace-content">{children}</main>
      </div>
    </div>
  );
};
