import { useMemo, useCallback, useEffect, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
  type NodeTypes,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Branch, Checkpoint } from '@variantree/core';
import { getBranchColor, getBranchColorMuted } from '../utils/branchColors';
import BranchNode, { type BranchNodeData } from './BranchNode';

interface TreeVisualizationProps {
  branches: Array<Branch & { isActive: boolean; messageCount: number }>;
  checkpoints: Checkpoint[];
  onSwitchBranch: (branchId: string) => void;
  onRestoreBranch: (branchId: string) => void;
}

const NODE_WIDTH = 140;
const NODE_HEIGHT = 36;
const HORIZONTAL_GAP = 40;
const VERTICAL_GAP = 70;

const nodeTypes: NodeTypes = {
  branch: BranchNode,
};

interface LayoutNode {
  branch: Branch & { isActive: boolean; messageCount: number };
  children: LayoutNode[];
  colorIndex: number;
  x: number;
  y: number;
}

export default function TreeVisualization({
  branches,
  checkpoints,
  onSwitchBranch,
  onRestoreBranch,
}: TreeVisualizationProps) {
  const branchColorMap = useMemo(() => {
    const map = new Map<string, number>();
    branches.forEach((b, i) => map.set(b.id, i));
    return map;
  }, [branches]);

  const { initialNodes, initialEdges } = useMemo(() => {
    // Build parent→children map
    const childrenMap = new Map<string, Array<Branch & { isActive: boolean; messageCount: number }>>();
    // Build child→parent branch map for ancestry walk
    const parentBranchMap = new Map<string, string>(); // childBranchId → parentBranchId

    for (const branch of branches) {
      if (branch.parentCheckpointId) {
        const cp = checkpoints.find((c) => c.id === branch.parentCheckpointId);
        if (cp) {
          if (!childrenMap.has(cp.branchId)) childrenMap.set(cp.branchId, []);
          childrenMap.get(cp.branchId)!.push(branch);
          parentBranchMap.set(branch.id, cp.branchId);
        }
      }
    }

    // Walk up from active branch to root, collect all ancestor branch IDs
    const activeBranch = branches.find((b) => b.isActive);
    const activePath = new Set<string>();
    if (activeBranch) {
      let current: string | undefined = activeBranch.id;
      while (current) {
        activePath.add(current);
        current = parentBranchMap.get(current);
      }
    }

    function buildLayoutTree(
      branch: Branch & { isActive: boolean; messageCount: number },
    ): LayoutNode {
      const childBranches = (childrenMap.get(branch.id) || []) as Array<Branch & { isActive: boolean; messageCount: number }>;
      return {
        branch,
        children: childBranches.map((child) => buildLayoutTree(child)),
        colorIndex: branchColorMap.get(branch.id) ?? 0,
        x: 0,
        y: 0,
      };
    }

    const roots = branches
      .filter((b) => b.parentCheckpointId === null)
      .map((b) => buildLayoutTree(b));

    if (roots.length === 0) {
      return { initialNodes: [], initialEdges: [] };
    }

    // Layout: top-down tree, center parents over children
    let nextX = 0;

    function layoutTree(node: LayoutNode, depth: number): void {
      node.y = depth * (NODE_HEIGHT + VERTICAL_GAP);

      if (node.children.length === 0) {
        node.x = nextX;
        nextX += NODE_WIDTH + HORIZONTAL_GAP;
        return;
      }

      node.children.forEach((child) => layoutTree(child, depth + 1));

      const firstChild = node.children[0];
      const lastChild = node.children[node.children.length - 1];
      node.x = (firstChild.x + lastChild.x) / 2;
    }

    roots.forEach((root) => layoutTree(root, 0));

    // Flatten into React Flow nodes and edges
    const rfNodes: Node<BranchNodeData>[] = [];
    const rfEdges: Edge[] = [];

    function flatten(node: LayoutNode): void {
      const branchCheckpoints = checkpoints.filter(
        (cp) => cp.branchId === node.branch.id,
      );

      // Build parent branch name for hover card
      let parentBranchName = '—';
      if (node.branch.parentCheckpointId) {
        const parentCp = checkpoints.find((c) => c.id === node.branch.parentCheckpointId);
        if (parentCp) {
          const parentBranch = branches.find((b) => b.id === parentCp.branchId);
          if (parentBranch) parentBranchName = parentBranch.name;
        }
      }

      const lastUserMsg = [...node.branch.messages].reverse().find((m) => m.role === 'user');
      const lastAssistantMsg = [...node.branch.messages].reverse().find((m) => m.role === 'assistant');

      rfNodes.push({
        id: node.branch.id,
        type: 'branch',
        position: { x: node.x, y: node.y },
        data: {
          label: node.branch.name,
          colorIndex: node.colorIndex,
          isActive: node.branch.isActive,
          messageCount: node.branch.messageCount,
          checkpointCount: branchCheckpoints.length,
          branchId: node.branch.id,
          parentBranchName,
          createdAt: node.branch.createdAt,
          lastUserContent: lastUserMsg?.content ?? '',
          lastAssistantContent: lastAssistantMsg?.content ?? '',
          isCardOpen: false,
          onRestoreBranch,
        },
      });

      node.children.forEach((child) => {
        const parentColor = getBranchColor(node.colorIndex);
        const isOnActivePath = activePath.has(child.branch.id);

        rfEdges.push({
          id: `${node.branch.id}->${child.branch.id}`,
          source: node.branch.id,
          target: child.branch.id,
          type: 'default',
          animated: isOnActivePath,
          style: {
            stroke: parentColor,
            strokeWidth: isOnActivePath ? 2 : 1.5,
            strokeOpacity: isOnActivePath ? 0.8 : 0.35,
          },
        });

        flatten(child);
      });
    }

    roots.forEach((root) => flatten(root));

    return { initialNodes: rfNodes, initialEdges: rfEdges };
  }, [branches, checkpoints, branchColorMap, onRestoreBranch]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  useEffect(() => {
    setNodes(initialNodes);
  }, [initialNodes, setNodes]);

  useEffect(() => {
    setEdges(initialEdges);
  }, [initialEdges, setEdges]);

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const nodesWithCard = useMemo(
    () => nodes.map((n) => ({ ...n, data: { ...n.data, isCardOpen: n.id === selectedNodeId } })),
    [nodes, selectedNodeId],
  );

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      setSelectedNodeId((prev) => (prev === node.id ? null : node.id));
      onSwitchBranch(node.id);
    },
    [onSwitchBranch],
  );

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
  }, []);

  if (initialNodes.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-muted">
        <div className="flex flex-col items-center gap-3">
          <svg className="w-10 h-10 text-text-faint" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="8" y="14" width="8" height="7" rx="1" />
            <path d="M6.5 10v1.5a1.5 1.5 0 0 0 1.5 1.5h0" />
            <path d="M17.5 10v1.5a1.5 1.5 0 0 1-1.5 1.5h0" />
          </svg>
          <p className="text-[13px] text-text-faint m-0">No branches to visualize</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-screen bg-bg">
      <div className="py-3 px-5 border-b border-border flex items-center justify-between bg-bg-secondary">
        <h2 className="text-[13px] font-semibold text-text-primary m-0 tracking-[-0.01em]">
          Conversation Tree
        </h2>
        <span className="text-[11px] text-text-muted tabular-nums">
          {branches.length} branches · {checkpoints.length} checkpoints
        </span>
      </div>

      <div className="flex-1">
        <ReactFlow
          nodes={nodesWithCard}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.35, maxZoom: 0.65 }}
          minZoom={0.2}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
          defaultEdgeOptions={{
            type: 'default',
          }}
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={20}
            size={1}
            color="var(--color-text-faint)"
            style={{ opacity: 0.3 }}
          />
          <Controls
            showInteractive={false}
            className="rf-controls-pill"
            position="bottom-left"
          />
          <MiniMap
            nodeColor={(node) => {
              const data = node.data as BranchNodeData;
              return getBranchColor(data?.colorIndex ?? 0);
            }}
            maskColor="rgba(0, 0, 0, 0.55)"
            className="rf-minimap-glass"
            pannable
            zoomable
            nodeStrokeWidth={0}
            nodeBorderRadius={3}
          />
        </ReactFlow>
      </div>
    </div>
  );
}
