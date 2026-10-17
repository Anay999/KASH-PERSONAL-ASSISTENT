import React from 'react';
import { Eye, MessageSquare, Database, Activity, FolderTree, Terminal } from 'lucide-react';

/**
 * Spatial Workspace Navigation Dock.
 * Lets the user toggle seamlessly between spatial computing environments
 * with keyboard number shortcuts (1-6).
 */
export const WorkspaceNav = ({ activeWorkspace, onSelectWorkspace }) => {
  const workspaces = [
    { id: 'core', label: 'CORE', icon: Eye, shortcut: '1' },
    { id: 'conversation', label: 'CONVERSATION', icon: MessageSquare, shortcut: '2' },
    { id: 'memory', label: 'MEMORY', icon: Database, shortcut: '3' },
    { id: 'systems', label: 'SYSTEMS', icon: Activity, shortcut: '4' },
    { id: 'projects', label: 'PROJECTS', icon: FolderTree, shortcut: '5' },
    { id: 'diagnostics', label: 'DIAGNOSTICS', icon: Terminal, shortcut: '6' }
  ];

  return (
    <nav className="workspace-dock spatial-hud-interactive" aria-label="Workspace Navigation">
      {workspaces.map((ws) => {
        const Icon = ws.icon;
        const isActive = activeWorkspace === ws.id;
        return (
          <button
            key={ws.id}
            className={`workspace-tab ${isActive ? 'active' : ''}`}
            onClick={() => onSelectWorkspace(ws.id)}
            title={`Switch to ${ws.label} Workspace (Press ${ws.shortcut})`}
          >
            <Icon size={13} />
            <span>{ws.label}</span>
            <span className="tab-shortcut">[{ws.shortcut}]</span>
          </button>
        );
      })}
    </nav>
  );
};
