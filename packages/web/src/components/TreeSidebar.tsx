import { useState, useMemo } from 'react';
import { Branch, Checkpoint } from '@variantree/core';
import './TreeSidebar.css';

interface TreeSidebarProps {
  branches: Array<Branch & { isActive: boolean; messageCount: number }>;
  checkpoints: Checkpoint[];
  activeBranchId: string | null;
  onSwitchBranch: (branchId: string) => void;
  onDeleteBranch: (branchId: string) => void;
  onCreateCheckpoint: () => void;
  onCreateBranch: () => void;
  onToggleTreeView: () => void;
  isTreeViewActive: boolean;
}

type TabType = 'tree' | 'branches' | 'info';

export default function TreeSidebar({
  branches,
  checkpoints,
  activeBranchId,
  onSwitchBranch,
  onDeleteBranch,
  onCreateCheckpoint,
  onCreateBranch,
  onToggleTreeView,
  isTreeViewActive,
}: TreeSidebarProps) {
  const [activeTab, setActiveTab] = useState<TabType>('tree');

  const activeBranch = branches.find((b) => b.id === activeBranchId);
  const activeBranchCheckpoints = useMemo(() => {
    if (!activeBranchId) return [];
    return checkpoints
      .filter((cp) => cp.branchId === activeBranchId)
      .sort((a, b) => a.createdAt - b.createdAt);
  }, [checkpoints, activeBranchId]);

  // Build timeline items: Start + checkpoints
  const timelineItems = useMemo(() => {
    const items: Array<{
      type: 'start' | 'checkpoint';
      label: string;
      time: number;
      id?: string;
      isLive: boolean;
    }> = [];

    if (activeBranch) {
      items.push({
        type: 'start',
        label: 'Start',
        time: activeBranch.createdAt,
        isLive: activeBranchCheckpoints.length === 0,
      });

      activeBranchCheckpoints.forEach((cp, index) => {
        items.push({
          type: 'checkpoint',
          label: cp.label,
          time: cp.createdAt,
          id: cp.id,
          isLive: index === activeBranchCheckpoints.length - 1,
        });
      });
    }

    return items;
  }, [activeBranch, activeBranchCheckpoints]);

  const formatTimeAgo = (timestamp: number) => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return 'now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    return `${Math.floor(hours / 24)}d`;
  };

  return (
    <aside className="sidebar">
      {/* Header */}
      <div className="sidebar-header">
        <div className="sidebar-title">
          <span className="sidebar-icon">▲</span>
          <span>Variantree</span>
        </div>
        <div className="sidebar-status">
          <span className="status-dot" />
          <span className="status-label">live</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="sidebar-tabs">
        {(['tree', 'branches', 'info'] as TabType[]).map((tab) => (
          <button
            key={tab}
            className={`sidebar-tab ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="sidebar-content">
        {activeTab === 'tree' && (
          <div className="timeline-view">
            <div className="session-label">
              SESSION · {activeBranch?.name.toUpperCase() ?? 'MAIN'}
            </div>

            <div className="timeline">
              {timelineItems.map((item, index) => (
                <div
                  key={item.id ?? `start-${index}`}
                  className={`timeline-item ${item.isLive ? 'live' : ''}`}
                >
                  <div className="timeline-connector">
                    <span className={`timeline-dot ${item.isLive ? 'live' : ''}`} />
                    {index < timelineItems.length - 1 && (
                      <span className="timeline-line" />
                    )}
                  </div>
                  <div className="timeline-content">
                    <span className="timeline-label">{item.label}</span>
                    <div className="timeline-meta">
                      <span className="timeline-time">{formatTimeAgo(item.time)}</span>
                      {item.isLive && <span className="live-badge">live</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'branches' && (
          <div className="branches-list">
            {branches.map((branch) => (
              <div
                key={branch.id}
                className={`branch-item ${branch.isActive ? 'active' : ''}`}
                onClick={() => onSwitchBranch(branch.id)}
              >
                <div className="branch-info">
                  <span className={`branch-dot ${branch.isActive ? 'active' : ''}`} />
                  <span className="branch-name">{branch.name}</span>
                </div>
                <div className="branch-meta">
                  <span className="branch-count">{branch.messageCount} msgs</span>
                  {branch.name !== 'main' && !branch.isActive && (
                    <button
                      className="branch-delete"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteBranch(branch.id);
                      }}
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'info' && (
          <div className="info-view">
            <div className="info-item">
              <span className="info-label">Active Branch</span>
              <span className="info-value">{activeBranch?.name ?? '—'}</span>
            </div>
            <div className="info-item">
              <span className="info-label">Total Branches</span>
              <span className="info-value">{branches.length}</span>
            </div>
            <div className="info-item">
              <span className="info-label">Checkpoints</span>
              <span className="info-value">{checkpoints.length}</span>
            </div>
            <div className="info-item">
              <span className="info-label">Messages (this branch)</span>
              <span className="info-value">{activeBranch?.messageCount ?? 0}</span>
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="sidebar-actions">
        <button className="sidebar-btn" onClick={onCreateCheckpoint}>
          <span className="btn-icon">📌</span> Checkpoint
        </button>
        <button className="sidebar-btn" onClick={onCreateBranch}>
          <span className="btn-icon">🌿</span> Branch
        </button>
        <button
          className={`sidebar-btn view-tree-btn ${isTreeViewActive ? 'active' : ''}`}
          onClick={onToggleTreeView}
        >
          <span className="btn-icon">🗺️</span> {isTreeViewActive ? 'Chat' : 'Full Tree'}
        </button>
      </div>
    </aside>
  );
}
