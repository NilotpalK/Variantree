import { useState, useMemo, useRef, useCallback } from 'react';
import { Branch, Checkpoint } from '@variantree/core';
import { getBranchColor, getBranchColorMuted } from '../utils/branchColors';

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
          if (!childrenMap.has(cp.branchId)) childrenMap.set(cp.branchId, []);
          childrenMap.get(cp.branchId)!.push(branch);
        }
      }
    }
    function buildTree(branch: Branch & { isActive: boolean; messageCount: number }): SidebarTreeNode {
      const childBranches = childrenMap.get(branch.id) || [];
      return { branch, children: childBranches.map((child) => buildTree(child)), colorIndex: branchColorMap.get(branch.id) ?? 0 };
    }
    return branches.filter((b) => b.parentCheckpointId === null).map((b) => buildTree(b));
  }, [branches, checkpoints, branchColorMap]);

  const totalNodes = useMemo(() => {
    let count = 0;
    function walk(nodes: SidebarTreeNode[]) { for (const n of nodes) { count++; walk(n.children); } }
    walk(treeRoots);
    return count;
  }, [treeRoots]);

  const sessionDuration = useMemo(() => {
    if (branches.length === 0) return '0m';
    const earliest = Math.min(...branches.map((b) => b.createdAt));
    return getRelativeTimeShort(earliest);
  }, [branches]);

  /* ─── Branch node ──── */

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
      <div key={node.branch.id} className="branch-tree-node-wrapper flex flex-col" style={{ '--node-color': color } as React.CSSProperties}>
        <div
          className={`flex items-center gap-2 py-1.5 px-2 rounded-md cursor-pointer transition-all duration-150 ease-out select-none group ${isActive ? 'bg-bg-active' : ''} ${isHovered ? 'bg-bg-active' : ''} hover:bg-bg-hover`}
          onClick={handleClick}
          onMouseEnter={() => handleNodeMouseEnter(node.branch.id)}
          onMouseLeave={handleMouseLeave}
        >
          <span
            className={`rounded-full shrink-0 transition-all duration-200 ${isActive ? 'w-2.5 h-2.5' : 'w-2 h-2'}`}
            style={{
              background: color,
              boxShadow: isActive ? `0 0 0 2px var(--color-bg-secondary), 0 0 0 3.5px ${getBranchColorMuted(node.colorIndex, 0.3)}` : undefined,
            }}
          />
          <span className={`text-[12px] whitespace-nowrap overflow-hidden text-ellipsis min-w-0 flex-1 transition-colors duration-150 ${isActive ? 'font-semibold' : 'font-medium'}`} style={{ color }}>
            {node.branch.name}
          </span>
          {isActive ? (
            <span className="text-[9px] font-semibold py-px px-1.5 rounded-full tracking-[0.03em] shrink-0" style={{ color, background: getBranchColorMuted(node.colorIndex, 0.12) }}>
              active
            </span>
          ) : (
            <span className="text-[10px] text-text-faint shrink-0 tabular-nums opacity-0 group-hover:opacity-100 transition-opacity duration-150">
              {getRelativeTimeShort(node.branch.createdAt)}
            </span>
          )}
        </div>
        {hasChildren && !isCollapsed && (
          <div className="branch-tree-children ml-3 pl-3 relative" style={{ '--branch-line-color': color } as React.CSSProperties}>
            {node.children.map((child) => renderBranchNode(child))}
          </div>
        )}
      </div>
    );
  }

  /* ─── Detail card ──── */

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

    const branchCheckpoints = checkpoints.filter((cp) => cp.branchId === hoveredBranch.id).sort((a, b) => b.createdAt - a.createdAt);
    const latestCp = branchCheckpoints[0] ?? null;

    const parentCpDisplay = hoveredBranch.parentCheckpointId
      ? hoveredBranch.parentCheckpointId.length > 10 ? hoveredBranch.parentCheckpointId.slice(0, 10) : hoveredBranch.parentCheckpointId
      : '—';

    return (
      <div
        className="absolute left-[calc(100%+8px)] top-[56px] w-[260px] max-h-[calc(100vh-80px)] overflow-y-auto flex flex-col p-4 bg-bg-elevated border border-border rounded-lg shadow-[0_8px_32px_rgba(0,0,0,0.45)] z-100 animate-[detailCardIn_0.15s_ease-out]"
        onMouseEnter={handleCardMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <div className="flex items-center gap-2 mb-4">
          <span className={`rounded-full shrink-0 ${isActive ? 'w-3 h-3' : 'w-2.5 h-2.5'}`} style={{ background: color, boxShadow: isActive ? `0 0 0 2px var(--color-bg-elevated), 0 0 0 3.5px ${getBranchColorMuted(colorIndex, 0.3)}` : undefined }} />
          <span className="text-[15px] font-bold text-text-primary leading-none tracking-[-0.02em]">{hoveredBranch.name}</span>
          {isActive && (
            <span className="text-[9px] font-semibold py-px px-1.5 rounded-full tracking-[0.03em] ml-auto" style={{ color, background: getBranchColorMuted(colorIndex, 0.12) }}>active</span>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 mb-4 border-t border-b border-border py-3 gap-2">
          <div className="flex flex-col gap-1">
            <span className="text-[9px] text-text-muted tracking-[0.06em] uppercase font-medium">Branch</span>
            <span className="text-[11px] font-semibold text-text-primary truncate">{parentBranchName}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[9px] text-text-muted tracking-[0.06em] uppercase font-medium">Msgs</span>
            <span className="text-[11px] font-semibold text-text-primary">{hoveredBranch.messageCount}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[9px] text-text-muted tracking-[0.06em] uppercase font-medium">Created</span>
            <span className="text-[11px] font-semibold text-text-primary">{getRelativeTime(hoveredBranch.createdAt)}</span>
          </div>
        </div>

        {/* Last exchange */}
        {(lastUserMsg || lastAssistantMsg) && (
          <div className="mb-4">
            <div className="text-[9px] text-text-muted tracking-[0.06em] uppercase font-medium mb-2">Last Exchange</div>
            {lastUserMsg && (
              <div className="mb-2 last:mb-0">
                <span className="text-[10px] font-bold tracking-[0.04em] block mb-0.5 text-text-primary uppercase">You</span>
                <p className="text-[11px] text-text-secondary leading-relaxed m-0">{lastUserMsg.content.length > 80 ? lastUserMsg.content.slice(0, 80) + '...' : lastUserMsg.content}</p>
              </div>
            )}
            {lastAssistantMsg && (
              <div className="mb-2 last:mb-0">
                <span className="text-[10px] font-bold tracking-[0.04em] block mb-0.5 text-green uppercase">Claude</span>
                <p className="text-[11px] text-text-secondary leading-relaxed m-0">{lastAssistantMsg.content.length > 80 ? lastAssistantMsg.content.slice(0, 80) + '...' : lastAssistantMsg.content}</p>
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 mb-4">
          <button
            className="flex-1 flex items-center justify-center gap-1.5 h-7 rounded-md text-[11px] font-semibold cursor-pointer transition-all duration-150 ease-out font-[inherit] border border-btn-border bg-btn text-text-primary hover:brightness-110"
            onClick={() => { onSwitchBranch(hoveredBranch.id); onCreateBranch(); setHoveredBranchId(null); }}
          >
            <svg className="w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="18" r="3" /><circle cx="6" cy="6" r="3" /><circle cx="18" cy="6" r="3" /><path d="M12 15V9" /><path d="M8.7 7.5 11 9" /><path d="M15.3 7.5 13 9" /></svg>
            Branch
          </button>
          <button
            className="flex-1 flex items-center justify-center gap-1.5 h-7 rounded-md text-[11px] font-semibold cursor-pointer transition-all duration-150 ease-out font-[inherit] border border-btn-border bg-btn text-text-secondary hover:brightness-110 hover:text-text-primary"
            onClick={() => { onSwitchBranch(hoveredBranch.id); setHoveredBranchId(null); }}
          >
            <svg className="w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /></svg>
            Restore
          </button>
        </div>

        {/* Checkpoint info */}
        {latestCp ? (
          <div className="border-t border-border pt-3">
            <div className="text-[9px] text-text-muted tracking-[0.06em] uppercase font-medium mb-2">Checkpoint</div>
            {[
              { label: 'ID', value: latestCp.id.length > 10 ? latestCp.id.slice(0, 10) : latestCp.id },
              { label: 'Parent', value: parentCpDisplay },
              ...(latestCp.metadata?.tokens != null ? [{ label: 'Tokens', value: `~${String(latestCp.metadata.tokens)}` }] : []),
              ...(latestCp.metadata?.provider != null ? [{ label: 'Provider', value: String(latestCp.metadata.provider) }] : []),
            ].map((item) => (
              <div key={item.label} className="flex justify-between items-center py-1">
                <span className="text-[11px] text-text-muted">{item.label}</span>
                <span className="text-[11px] text-text-primary font-mono font-medium">{item.value}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="border-t border-border pt-3">
            <div className="text-[9px] text-text-muted tracking-[0.06em] uppercase font-medium mb-2">Checkpoint</div>
            <p className="text-[11px] text-text-faint m-0">No checkpoints on this branch</p>
          </div>
        )}
      </div>
    );
  }

  const activeBranchColor = getBranchColor(activeBranchColorIndex);

  /* ─── Collapsed ──── */

  if (collapsed) {
    return (
      <aside className="w-[44px] min-w-[44px] bg-bg-secondary border-r border-border flex flex-col h-screen transition-all duration-200 ease-out relative items-center pt-3">
        <button
          className="bg-transparent border-0 text-text-faint cursor-pointer p-1 rounded-md flex items-center justify-center transition-all duration-150 ease-out hover:text-text-primary hover:bg-bg-hover [&>svg]:w-3.5 [&>svg]:h-3.5"
          onClick={onToggleCollapse}
          title="Expand sidebar"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
        </button>
        <div className="flex flex-col gap-1 mt-auto pb-3">
          <button className="bg-transparent border-0 text-text-muted cursor-pointer p-2 rounded-md transition-all duration-150 ease-out flex items-center justify-center hover:bg-bg-hover hover:text-text-primary [&>svg]:w-4 [&>svg]:h-4" onClick={onCreateCheckpoint} title="Create checkpoint">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v8" /><circle cx="12" cy="14" r="4" /><path d="M12 18v4" /></svg>
          </button>
          <button className="bg-transparent border-0 text-text-muted cursor-pointer p-2 rounded-md transition-all duration-150 ease-out flex items-center justify-center hover:bg-bg-hover hover:text-text-primary [&>svg]:w-4 [&>svg]:h-4" onClick={onCreateBranch} title="Create branch">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="18" r="3" /><circle cx="6" cy="6" r="3" /><circle cx="18" cy="6" r="3" /><path d="M12 15V9" /><path d="M8.7 7.5 11 9" /><path d="M15.3 7.5 13 9" /></svg>
          </button>
          <button
            className={`border-0 cursor-pointer p-2 rounded-md transition-all duration-150 ease-out flex items-center justify-center [&>svg]:w-4 [&>svg]:h-4 ${isTreeViewActive ? 'bg-text-primary text-bg' : 'bg-transparent text-text-muted hover:bg-bg-hover hover:text-text-primary'}`}
            onClick={onToggleTreeView} title={isTreeViewActive ? 'Show chat' : 'Full tree'}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="8" y="14" width="8" height="7" rx="1" /><path d="M6.5 10v1.5a1.5 1.5 0 0 0 1.5 1.5h0" /><path d="M17.5 10v1.5a1.5 1.5 0 0 1-1.5 1.5h0" /></svg>
          </button>
        </div>
      </aside>
    );
  }

  /* ─── Expanded ──── */

  return (
    <aside className="w-[320px] min-w-[320px] bg-bg-secondary border-r border-border flex flex-col h-screen transition-all duration-200 ease-out relative">
      {/* Header */}
      <div className="py-3 px-4 flex items-center justify-between border-b border-border">
        <div className="flex items-center gap-2 text-[13px] font-semibold text-text-primary tracking-[-0.01em]">
          <svg className="sidebar-icon" viewBox="0 0 100 100" fill="none" style={{ width: 18, height: 18 }}>
            <polygon points="20,20 38,20 58,80 40,80" fill="currentColor" />
            <polygon points="60,20 64,20 44,80 40,80" fill="currentColor" />
            <polygon points="67,20 71,20 51,80 47,80" fill="currentColor" />
            <polygon points="74,20 78,20 58,80 54,80" fill="currentColor" />
            <polygon points="81,20 85,20 65,80 61,80" fill="currentColor" />
          </svg>
          <span>Variantree</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-green animate-[pulse_2s_ease-in-out_infinite]" />
            <span className="text-[10px] font-medium text-green">live</span>
          </div>
          <button
            className="bg-transparent border-0 text-text-faint cursor-pointer p-1 rounded-md flex items-center justify-center transition-all duration-150 ease-out hover:text-text-primary hover:bg-bg-hover [&>svg]:w-3.5 [&>svg]:h-3.5"
            onClick={onToggleCollapse} title="Collapse sidebar"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 px-4 border-b border-border">
        {(['tree', 'checkpoints', 'info'] as TabType[]).map((tab) => (
          <button
            key={tab}
            className={`bg-transparent border-0 py-2 px-0 text-[12px] font-medium cursor-pointer border-b-[1.5px] border-solid transition-all duration-150 ease-out font-[inherit] leading-normal ${activeTab === tab ? 'text-text-primary border-b-text-primary' : 'text-text-muted border-b-transparent hover:text-text-secondary'}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto py-3 px-4">
        {activeTab === 'tree' && (
          <div className="flex flex-col gap-0.5">
            {treeRoots.map((root) => renderBranchNode(root))}
          </div>
        )}

        {activeTab === 'checkpoints' && (() => {
          const activeBranch = branches.find((b) => b.id === activeBranchId);
          const activeCps = checkpoints.filter((cp) => cp.branchId === activeBranchId).sort((a, b) => a.createdAt - b.createdAt);
          if (!activeBranch) return <div className="text-text-faint text-[12px] text-center py-6">No active branch</div>;

          return (
            <div className="flex flex-col" style={{ '--tl-color': activeBranchColor } as React.CSSProperties}>
              {/* Start */}
              <div className="flex gap-3 relative">
                <div className="flex flex-col items-center w-3 shrink-0 pt-1.5">
                  <span className="w-2 h-2 rounded-full shrink-0 z-[1]" style={{ background: activeBranchColor }} />
                  <span className="w-px flex-1 min-h-4 mt-1 opacity-20" style={{ background: `var(--tl-color, var(--color-text-faint))` }} />
                </div>
                <div className="flex-1 flex flex-col gap-0.5 pt-0.5 pb-4 min-w-0">
                  <span className="text-[12px] text-text-faint font-normal">Start</span>
                  <span className="text-[10px] text-text-faint tabular-nums">{getRelativeTime(activeBranch.createdAt)}</span>
                </div>
              </div>

              {/* Checkpoints */}
              {activeCps.map((cp) => {
                const childBranches = branches.filter((b) => b.parentCheckpointId === cp.id);
                return (
                  <div key={cp.id} className="flex gap-3 relative cursor-pointer rounded-md transition-all duration-150 ease-out hover:bg-bg-hover" onClick={() => onCheckpointClick(cp.messageIndex)}>
                    <div className="flex flex-col items-center w-3 shrink-0 pt-1.5">
                      <svg className="w-2.5 h-2.5 shrink-0 z-[1] opacity-85" style={{ color: activeBranchColor }} viewBox="0 0 24 24" fill="currentColor"><path d="M5 3a2 2 0 0 0-2 2v16l9-4 9 4V5a2 2 0 0 0-2-2H5z" /></svg>
                      <span className="w-px flex-1 min-h-4 mt-1 opacity-20" style={{ background: `var(--tl-color, var(--color-text-faint))` }} />
                    </div>
                    <div className="flex-1 flex flex-col gap-1 pt-0.5 pb-4 min-w-0">
                      <span className="text-[12px] text-text-secondary font-medium whitespace-nowrap overflow-hidden text-ellipsis">{cp.label}</span>
                      <div className="flex items-center flex-wrap gap-1.5">
                        <span className="text-[10px] text-text-faint tabular-nums">{getRelativeTime(cp.createdAt)}</span>
                        {childBranches.map((cb) => {
                          const cbColorIndex = branchColorMap.get(cb.id) ?? 0;
                          const cbColor = getBranchColor(cbColorIndex);
                          return (
                            <button key={cb.id} className="text-[10px] font-semibold py-px px-2 rounded-full border bg-transparent cursor-pointer tracking-[0.01em] transition-all duration-150 ease-out font-[inherit] whitespace-nowrap hover:opacity-80"
                              style={{ color: cbColor, background: getBranchColorMuted(cbColorIndex, 0.1), borderColor: getBranchColorMuted(cbColorIndex, 0.25) }}
                              onClick={(e) => { e.stopPropagation(); onSwitchBranch(cb.id); }}
                            >{cb.name} →</button>
                          );
                        })}
                        <button
                          className="inline-flex items-center gap-0.5 text-[10px] font-semibold py-px px-2 rounded-full border border-border bg-transparent text-text-faint cursor-pointer font-[inherit] transition-all duration-150 ease-out whitespace-nowrap hover:text-text-primary hover:bg-bg-hover [&>svg]:w-2 [&>svg]:h-2"
                          onClick={(e) => { e.stopPropagation(); onBranchFromCheckpoint(cp.id); }}
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="18" r="3" /><circle cx="6" cy="6" r="3" /><circle cx="18" cy="6" r="3" /><path d="M12 15V9" /><path d="M8.7 7.5 11 9" /><path d="M15.3 7.5 13 9" /></svg>
                          Branch
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Now */}
              <div className="flex gap-3 relative">
                <div className="flex flex-col items-center w-3 shrink-0 pt-1.5">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0 z-[1]" style={{ background: activeBranchColor, boxShadow: `0 0 0 2px var(--color-bg-secondary), 0 0 0 3.5px ${getBranchColorMuted(activeBranchColorIndex, 0.3)}, 0 0 8px ${getBranchColorMuted(activeBranchColorIndex, 0.2)}` }} />
                </div>
                <div className="flex-1 flex flex-col gap-0.5 pt-0.5 pb-4 min-w-0">
                  <span className="text-[12px] font-semibold" style={{ color: activeBranchColor }}>Now</span>
                  <span className="text-[9px] font-semibold py-px px-1.5 rounded-full tracking-[0.03em] w-fit text-green bg-green-muted">live</span>
                </div>
              </div>
            </div>
          );
        })()}

        {activeTab === 'info' && (
          <div className="flex flex-col gap-px">
            {[
              { label: 'Active Branch', value: branches.find((b) => b.id === activeBranchId)?.name ?? '—', color: activeBranchColor },
              { label: 'Total Branches', value: String(branches.length) },
              { label: 'Checkpoints', value: String(checkpoints.length) },
              { label: 'Messages', value: String(branches.find((b) => b.id === activeBranchId)?.messageCount ?? 0) },
            ].map((item) => (
              <div key={item.label} className="flex justify-between items-center py-2 px-0.5">
                <span className="text-[12px] text-text-muted">{item.label}</span>
                <span className="text-[12px] font-medium tabular-nums" style={{ color: item.color || 'var(--color-text-primary)' }}>{item.value}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Stats */}
      {activeTab === 'tree' && (
        <div className="grid grid-cols-3 py-3 px-4 border-t border-border">
          {[
            { value: totalNodes, label: 'Nodes' },
            { value: branches.length, label: 'Branches' },
            { value: sessionDuration, label: 'Session' },
          ].map((s) => (
            <div key={s.label} className="flex flex-col items-center gap-1">
              <span className="text-[15px] font-bold text-text-primary tabular-nums leading-none">{s.value}</span>
              <span className="text-[9px] text-text-muted tracking-[0.06em] uppercase font-medium">{s.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="p-3 px-4 border-t border-border flex flex-col gap-1.5">
        <button className="flex items-center gap-2 h-7 px-3 border border-btn-border rounded-md bg-btn text-text-secondary text-[12px] font-medium cursor-pointer transition-all duration-150 ease-out font-[inherit] hover:brightness-110 hover:text-text-primary" onClick={onCreateCheckpoint}>
          <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v8" /><circle cx="12" cy="14" r="4" /><path d="M12 18v4" /></svg>
          Checkpoint
        </button>
        <button className="flex items-center gap-2 h-7 px-3 border border-btn-border rounded-md bg-btn text-text-secondary text-[12px] font-medium cursor-pointer transition-all duration-150 ease-out font-[inherit] hover:brightness-110 hover:text-text-primary" onClick={onCreateBranch}>
          <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="18" r="3" /><circle cx="6" cy="6" r="3" /><circle cx="18" cy="6" r="3" /><path d="M12 15V9" /><path d="M8.7 7.5 11 9" /><path d="M15.3 7.5 13 9" /></svg>
          Branch
        </button>
        <button
          className={`flex items-center gap-2 h-7 px-3 rounded-md text-[12px] font-medium cursor-pointer transition-all duration-150 ease-out font-[inherit] ${isTreeViewActive ? 'bg-text-primary text-bg border-0 hover:opacity-90' : 'bg-btn text-text-secondary border border-btn-border hover:brightness-110 hover:text-text-primary'}`}
          onClick={onToggleTreeView}
        >
          <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="8" y="14" width="8" height="7" rx="1" /><path d="M6.5 10v1.5a1.5 1.5 0 0 0 1.5 1.5h0" /><path d="M17.5 10v1.5a1.5 1.5 0 0 1-1.5 1.5h0" /></svg>
          {isTreeViewActive ? 'Chat' : 'Full Tree'}
        </button>
      </div>

      {hoveredBranch && renderNodeDetailCard()}
    </aside>
  );
}
