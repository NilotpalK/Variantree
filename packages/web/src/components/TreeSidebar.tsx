import { useState, useMemo, useRef, useCallback } from 'react';
import { Branch, Checkpoint } from '@variantree/core';
import { getBranchColor, getBranchColorMuted } from '../utils/branchColors';
import './TreeSidebar.css';

interface TreeSidebarProps {
  branches: Array<Branch & { isActive: boolean; messageCount: number }>;
  checkpoints: Checkpoint[];
  activeBranchId: string | null;
  onSwitchBranch: (branchId: string) => void;
  onCreateCheckpoint: () => void;
  onCreateBranch: () => void;
  onToggleTreeView: () => void;
  isTreeViewActive: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onCheckpointClick: (messageIndex: number) => void;
  onBranchFromCheckpoint: (checkpointId: string) => void;
}

type TabType = 'tree' | 'checkpoints' | 'info';

function getRelativeTime(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function getRelativeTimeShort(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export default function TreeSidebar({
  branches,
  checkpoints,
  activeBranchId,
  onSwitchBranch,
  onCreateCheckpoint,
  onCreateBranch,
  onToggleTreeView,
  isTreeViewActive,
  collapsed,
  onToggleCollapse,
  onCheckpointClick,
  onBranchFromCheckpoint,
}: TreeSidebarProps) {
  const [activeTab, setActiveTab] = useState<TabType>('tree');
  const [collapsedNodes, setCollapsedNodes] = useState<Set<string>>(new Set());
  const [hoveredBranchId, setHoveredBranchId] = useState<string | null>(null);
  const hoverTimeoutRef = useRef<number | null>(null);

  const handleNodeMouseEnter = useCallback((branchId: string) => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setHoveredBranchId(branchId);
  }, []);

  const handleMouseLeave = useCallback(() => {
    hoverTimeoutRef.current = window.setTimeout(() => {
      setHoveredBranchId(null);
    }, 250);
  }, []);

  const handleCardMouseEnter = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
  }, []);

  const branchColorMap = useMemo(() => {
    const map = new Map<string, number>();
    branches.forEach((b, i) => map.set(b.id, i));
    return map;
  }, [branches]);

  const activeBranchColorIndex = activeBranchId
    ? branchColorMap.get(activeBranchId) ?? 0
    : 0;

  const hoveredBranch = hoveredBranchId
    ? branches.find((b) => b.id === hoveredBranchId) ?? null
    : null;

  interface SidebarTreeNode {
    branch: Branch & { isActive: boolean; messageCount: number };
    children: SidebarTreeNode[];
    colorIndex: number;
  }

  const treeRoots = useMemo(() => {
    const childrenMap = new Map<string, Array<Branch & { isActive: boolean; messageCount: number }>>();

    for (const branch of branches) {
      if (branch.parentCheckpointId) {
        const cp = checkpoints.find((c) => c.id === branch.parentCheckpointId);
        if (cp) {
          if (!childrenMap.has(cp.branchId)) {
            childrenMap.set(cp.branchId, []);
          }
          childrenMap.get(cp.branchId)!.push(branch);
        }
      }
    }

    function buildTree(
      branch: Branch & { isActive: boolean; messageCount: number },
    ): SidebarTreeNode {
      const childBranches = childrenMap.get(branch.id) || [];
      const children = childBranches.map((child) => buildTree(child));
      return {
        branch,
        children,
        colorIndex: branchColorMap.get(branch.id) ?? 0,
      };
    }

    return branches
      .filter((b) => b.parentCheckpointId === null)
      .map((b) => buildTree(b));
  }, [branches, checkpoints, branchColorMap]);

  const totalNodes = useMemo(() => {
    let count = 0;
    function walk(nodes: SidebarTreeNode[]) {
      for (const n of nodes) {
        count++;
        walk(n.children);
      }
    }
    walk(treeRoots);
    return count;
  }, [treeRoots]);

  const sessionDuration = useMemo(() => {
    if (branches.length === 0) return '0m';
    const earliest = Math.min(...branches.map((b) => b.createdAt));
    return getRelativeTimeShort(earliest);
  }, [branches]);

  function renderBranchNode(node: SidebarTreeNode) {
    const color = getBranchColor(node.colorIndex);
    const isActive = node.branch.id === activeBranchId;
    const isHovered = node.branch.id === hoveredBranchId;
    const hasChildren = node.children.length > 0;
    const isCollapsed = collapsedNodes.has(node.branch.id);

    const handleClick = () => {
      if (hasChildren) {
        setCollapsedNodes((prev) => {
          const next = new Set(prev);
          if (next.has(node.branch.id)) next.delete(node.branch.id);
          else next.add(node.branch.id);
          return next;
        });
      } else {
        onSwitchBranch(node.branch.id);
      }
    };

    return (
      <div
        key={node.branch.id}
        className="branch-tree-node-wrapper"
        style={{ '--node-color': color } as React.CSSProperties}
      >
        <div
          className={`branch-tree-node ${isActive ? 'active' : ''} ${isHovered ? 'hovered' : ''}`}
          onClick={handleClick}
          onMouseEnter={() => handleNodeMouseEnter(node.branch.id)}
          onMouseLeave={handleMouseLeave}
        >
          <span
            className={`branch-tree-dot ${isActive ? 'active' : ''}`}
            style={{
              background: color,
              boxShadow: isActive
                ? `0 0 0 3px var(--bg-secondary), 0 0 0 5px ${getBranchColorMuted(node.colorIndex, 0.4)}, 0 0 10px ${getBranchColorMuted(node.colorIndex, 0.3)}`
                : undefined,
            }}
          />
          <span
            className="branch-tree-name"
            style={{ color }}
          >
            {node.branch.name}
          </span>
          {isActive ? (
            <span
              className="branch-tree-active-badge"
              style={{
                color,
                background: getBranchColorMuted(node.colorIndex, 0.15),
              }}
            >
              active
            </span>
          ) : (
            <span className="branch-tree-time">
              {getRelativeTimeShort(node.branch.createdAt)}
            </span>
          )}
        </div>
        {hasChildren && !isCollapsed && (
          <div
            className="branch-tree-children"
            style={{
              '--branch-line-color': color,
            } as React.CSSProperties}
          >
            {node.children.map((child) => renderBranchNode(child))}
          </div>
        )}
      </div>
    );
  }

  function renderNodeDetailCard() {
    if (!hoveredBranch) return null;

    const colorIndex = branchColorMap.get(hoveredBranch.id) ?? 0;
    const color = getBranchColor(colorIndex);
    const isActive = hoveredBranch.id === activeBranchId;

    let parentBranchName = '—';
    if (hoveredBranch.parentCheckpointId) {
      const parentCp = checkpoints.find((c) => c.id === hoveredBranch.parentCheckpointId);
      if (parentCp) {
        const parentBranch = branches.find((b) => b.id === parentCp.branchId);
        if (parentBranch) parentBranchName = parentBranch.name;
      }
    }

    const lastUserMsg = [...hoveredBranch.messages].reverse().find((m) => m.role === 'user');
    const lastAssistantMsg = [...hoveredBranch.messages].reverse().find((m) => m.role === 'assistant');

    const branchCheckpoints = checkpoints
      .filter((cp) => cp.branchId === hoveredBranch.id)
      .sort((a, b) => b.createdAt - a.createdAt);
    const latestCp = branchCheckpoints[0] ?? null;

    const parentCpDisplay = hoveredBranch.parentCheckpointId
      ? hoveredBranch.parentCheckpointId.length > 10
        ? hoveredBranch.parentCheckpointId.slice(0, 10)
        : hoveredBranch.parentCheckpointId
      : '—';

    return (
      <div
        className="node-detail-card"
        onMouseEnter={handleCardMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <div className="node-detail-header">
          <span
            className={`node-detail-dot ${isActive ? 'active' : ''}`}
            style={{
              background: color,
              boxShadow: isActive
                ? `0 0 0 3px var(--bg-secondary), 0 0 0 5px ${getBranchColorMuted(colorIndex, 0.4)}`
                : undefined,
            }}
          />
          <span className="node-detail-name">{hoveredBranch.name}</span>
          {isActive && (
            <span
              className="node-detail-badge"
              style={{
                color,
                background: getBranchColorMuted(colorIndex, 0.15),
              }}
            >
              active
            </span>
          )}
        </div>

        <div className="node-detail-stats">
          <div className="node-detail-stat">
            <span className="detail-stat-label">BRANCH</span>
            <span className="detail-stat-value">{parentBranchName}</span>
          </div>
          <div className="node-detail-stat">
            <span className="detail-stat-label">MESSAGES</span>
            <span className="detail-stat-value">{hoveredBranch.messageCount} msgs</span>
          </div>
          <div className="node-detail-stat">
            <span className="detail-stat-label">CREATED</span>
            <span className="detail-stat-value">{getRelativeTime(hoveredBranch.createdAt)}</span>
          </div>
        </div>

        {(lastUserMsg || lastAssistantMsg) && (
          <div className="node-detail-exchange">
            <div className="detail-section-label">LAST EXCHANGE</div>
            {lastUserMsg && (
              <div className="exchange-message">
                <span className="exchange-role you">YOU</span>
                <p className="exchange-text">
                  {lastUserMsg.content.length > 100
                    ? lastUserMsg.content.slice(0, 100) + '...'
                    : lastUserMsg.content}
                </p>
              </div>
            )}
            {lastAssistantMsg && (
              <div className="exchange-message">
                <span className="exchange-role claude">CLAUDE</span>
                <p className="exchange-text">
                  {lastAssistantMsg.content.length > 100
                    ? lastAssistantMsg.content.slice(0, 100) + '...'
                    : lastAssistantMsg.content}
                </p>
              </div>
            )}
          </div>
        )}

        <div className="node-detail-actions">
          <button
            className="detail-action-btn primary"
            onClick={() => {
              onSwitchBranch(hoveredBranch.id);
              onCreateBranch();
              setHoveredBranchId(null);
            }}
          >
            <svg className="detail-action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="18" r="3" />
              <circle cx="6" cy="6" r="3" />
              <circle cx="18" cy="6" r="3" />
              <path d="M12 15V9" />
              <path d="M8.7 7.5 11 9" />
              <path d="M15.3 7.5 13 9" />
            </svg>
            Branch
          </button>
          <button
            className="detail-action-btn secondary"
            onClick={() => {
              onSwitchBranch(hoveredBranch.id);
              setHoveredBranchId(null);
            }}
          >
            <svg className="detail-action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
            </svg>
            Restore
          </button>
        </div>

        {latestCp ? (
          <div className="node-detail-checkpoint">
            <div className="detail-section-label">CHECKPOINT INFO</div>
            <div className="checkpoint-row">
              <span className="checkpoint-key">ID</span>
              <span className="checkpoint-val">
                {latestCp.id.length > 10 ? latestCp.id.slice(0, 10) : latestCp.id}
              </span>
            </div>
            <div className="checkpoint-row">
              <span className="checkpoint-key">Parent</span>
              <span className="checkpoint-val">{parentCpDisplay}</span>
            </div>
            {latestCp.metadata?.tokens != null && (
              <div className="checkpoint-row">
                <span className="checkpoint-key">Tokens</span>
                <span className="checkpoint-val">~{String(latestCp.metadata.tokens)}</span>
              </div>
            )}
            {latestCp.metadata?.provider != null && (
              <div className="checkpoint-row">
                <span className="checkpoint-key">Provider</span>
                <span className="checkpoint-val">{String(latestCp.metadata.provider)}</span>
              </div>
            )}
          </div>
        ) : (
          <div className="node-detail-checkpoint">
            <div className="detail-section-label">CHECKPOINT INFO</div>
            <p className="checkpoint-empty">No checkpoints on this branch</p>
          </div>
        )}
      </div>
    );
  }

  const activeBranchColor = getBranchColor(activeBranchColorIndex);

  if (collapsed) {
    return (
      <aside className="sidebar collapsed">
        <button className="collapse-btn" onClick={onToggleCollapse} title="Expand sidebar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m9 18 6-6-6-6" />
          </svg>
        </button>

        <div className="collapsed-actions">
          <button className="collapsed-icon-btn" onClick={onCreateCheckpoint} title="Create checkpoint">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2v8" />
              <circle cx="12" cy="14" r="4" />
              <path d="M12 18v4" />
            </svg>
          </button>
          <button className="collapsed-icon-btn" onClick={onCreateBranch} title="Create branch">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="18" r="3" />
              <circle cx="6" cy="6" r="3" />
              <circle cx="18" cy="6" r="3" />
              <path d="M12 15V9" />
              <path d="M8.7 7.5 11 9" />
              <path d="M15.3 7.5 13 9" />
            </svg>
          </button>
          <button
            className={`collapsed-icon-btn ${isTreeViewActive ? 'active' : ''}`}
            onClick={onToggleTreeView}
            title={isTreeViewActive ? 'Show chat' : 'Full tree'}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="8" y="14" width="8" height="7" rx="1" />
              <path d="M6.5 10v1.5a1.5 1.5 0 0 0 1.5 1.5h0" />
              <path d="M17.5 10v1.5a1.5 1.5 0 0 1-1.5 1.5h0" />
            </svg>
          </button>
        </div>
      </aside>
    );
  }

  return (
    <aside className="sidebar">
      {/* Header */}
      <div className="sidebar-header">
        <div className="sidebar-title">
          <svg className="sidebar-icon" viewBox="0 0 100 100" fill="none" style={{ width: 18, height: 18 }}>
            <polygon points="20,20 38,20 58,80 40,80" fill="currentColor" />
            <polygon points="60,20 64,20 44,80 40,80" fill="currentColor" />
            <polygon points="67,20 71,20 51,80 47,80" fill="currentColor" />
            <polygon points="74,20 78,20 58,80 54,80" fill="currentColor" />
            <polygon points="81,20 85,20 65,80 61,80" fill="currentColor" />
          </svg>
          <span>Variantree</span>
        </div>
        <div className="sidebar-header-right">
          <div className="sidebar-status">
            <span className="status-dot" style={{ background: activeBranchColor }} />
            <span className="status-label" style={{ color: activeBranchColor }}>live</span>
          </div>
          <button className="collapse-btn" onClick={onToggleCollapse} title="Collapse sidebar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="sidebar-tabs">
        {(['tree', 'checkpoints', 'info'] as TabType[]).map((tab) => (
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
          <div className="branch-tree">
            {treeRoots.map((root) => renderBranchNode(root))}
          </div>
        )}

        {activeTab === 'checkpoints' && (() => {
          const activeBranch = branches.find((b) => b.id === activeBranchId);
          const activeCps = checkpoints
            .filter((cp) => cp.branchId === activeBranchId)
            .sort((a, b) => a.createdAt - b.createdAt);

          if (!activeBranch) return <div className="timeline-empty">No active branch</div>;

          return (
            <div className="cp-timeline" style={{ '--tl-color': activeBranchColor } as React.CSSProperties}>

              {/* Start node */}
              <div className="cp-tl-item">
                <div className="cp-tl-rail">
                  <span className="cp-tl-dot start" style={{ background: activeBranchColor }} />
                  <span className="cp-tl-line" />
                </div>
                <div className="cp-tl-body">
                  <span className="cp-tl-label muted">Start</span>
                  <span className="cp-tl-time">{getRelativeTime(activeBranch.createdAt)}</span>
                </div>
              </div>

              {/* Checkpoint nodes */}
              {activeCps.map((cp) => {
                const childBranches = branches.filter((b) => b.parentCheckpointId === cp.id);
                return (
                  <div key={cp.id} className="cp-tl-item cp-tl-item--clickable" onClick={() => onCheckpointClick(cp.messageIndex)}>
                    <div className="cp-tl-rail">
                      {/* Bookmark icon */}
                      <svg className="cp-tl-bookmark" style={{ color: activeBranchColor }} viewBox="0 0 24 24" fill="currentColor">
                        <path d="M5 3a2 2 0 0 0-2 2v16l9-4 9 4V5a2 2 0 0 0-2-2H5z" />
                      </svg>
                      <span className="cp-tl-line" />
                    </div>
                    <div className="cp-tl-body">
                      <span className="cp-tl-label">{cp.label}</span>
                      <div className="cp-tl-meta">
                        <span className="cp-tl-time">{getRelativeTime(cp.createdAt)}</span>
                        {childBranches.map((cb) => {
                          const cbColorIndex = branchColorMap.get(cb.id) ?? 0;
                          const cbColor = getBranchColor(cbColorIndex);
                          return (
                            <button
                              key={cb.id}
                              className="cp-tl-branch-pill"
                              style={{
                                color: cbColor,
                                background: getBranchColorMuted(cbColorIndex, 0.15),
                                borderColor: getBranchColorMuted(cbColorIndex, 0.3),
                              }}
                              onClick={(e) => { e.stopPropagation(); onSwitchBranch(cb.id); }}
                              title={`Switch to branch: ${cb.name}`}
                            >
                              {cb.name} →
                            </button>
                          );
                        })}
                        <button
                          className="cp-tl-branch-btn"
                          onClick={(e) => { e.stopPropagation(); onBranchFromCheckpoint(cp.id); }}
                          title="Create a new branch from this checkpoint"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="18" r="3" />
                            <circle cx="6" cy="6" r="3" />
                            <circle cx="18" cy="6" r="3" />
                            <path d="M12 15V9" />
                            <path d="M8.7 7.5 11 9" />
                            <path d="M15.3 7.5 13 9" />
                          </svg>
                          Branch
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Now / live node */}
              <div className="cp-tl-item">
                <div className="cp-tl-rail">
                  <span
                    className="cp-tl-dot live"
                    style={{
                      background: activeBranchColor,
                      boxShadow: `0 0 0 3px var(--bg-secondary), 0 0 0 5px ${getBranchColorMuted(activeBranchColorIndex, 0.4)}, 0 0 12px ${getBranchColorMuted(activeBranchColorIndex, 0.3)}`,
                    }}
                  />
                </div>
                <div className="cp-tl-body">
                  <span className="cp-tl-label" style={{ color: activeBranchColor, fontWeight: 600 }}>Now</span>
                  <span
                    className="cp-tl-live-badge"
                    style={{
                      color: activeBranchColor,
                      background: getBranchColorMuted(activeBranchColorIndex, 0.15),
                    }}
                  >
                    live
                  </span>
                </div>
              </div>

            </div>
          );
        })()}

        {activeTab === 'info' && (
          <div className="info-view">
            <div className="info-item">
              <span className="info-label">Active Branch</span>
              <span className="info-value" style={{ color: activeBranchColor }}>
                {branches.find((b) => b.id === activeBranchId)?.name ?? '—'}
              </span>
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
              <span className="info-value">{branches.find((b) => b.id === activeBranchId)?.messageCount ?? 0}</span>
            </div>
          </div>
        )}
      </div>

      {/* Tree stats bar */}
      {activeTab === 'tree' && (
        <div className="tree-stats-bar">
          <div className="tree-stat">
            <span className="tree-stat-value">{totalNodes}</span>
            <span className="tree-stat-label">NODES</span>
          </div>
          <div className="tree-stat">
            <span className="tree-stat-value">{branches.length}</span>
            <span className="tree-stat-label">BRANCHES</span>
          </div>
          <div className="tree-stat">
            <span className="tree-stat-value">{sessionDuration}</span>
            <span className="tree-stat-label">SESSION</span>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="sidebar-actions">
        <button className="sidebar-btn" onClick={onCreateCheckpoint}>
          <svg className="btn-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2v8" />
            <circle cx="12" cy="14" r="4" />
            <path d="M12 18v4" />
          </svg>
          Checkpoint
        </button>
        <button className="sidebar-btn" onClick={onCreateBranch}>
          <svg className="btn-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="18" r="3" />
            <circle cx="6" cy="6" r="3" />
            <circle cx="18" cy="6" r="3" />
            <path d="M12 15V9" />
            <path d="M8.7 7.5 11 9" />
            <path d="M15.3 7.5 13 9" />
          </svg>
          Branch
        </button>
        <button
          className={`sidebar-btn view-tree-btn ${isTreeViewActive ? 'active' : ''}`}
          onClick={onToggleTreeView}
        >
          <svg className="btn-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="8" y="14" width="8" height="7" rx="1" />
            <path d="M6.5 10v1.5a1.5 1.5 0 0 0 1.5 1.5h0" />
            <path d="M17.5 10v1.5a1.5 1.5 0 0 1-1.5 1.5h0" />
          </svg>
          {isTreeViewActive ? 'Chat' : 'Full Tree'}
        </button>
      </div>

      {/* Floating detail card on hover */}
      {hoveredBranch && renderNodeDetailCard()}
    </aside>
  );
}
