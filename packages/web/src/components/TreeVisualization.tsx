import { useMemo, useCallback, useEffect, useState, useRef } from 'react';
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
  const containerRef = useRef<HTMLDivElement>(null);
  const [mousePos, setMousePos] = useState({ x: -1000, y: -1000 });

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    setMousePos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  }, []);

  const handleMouseLeave = useCallback(() => {
    setMousePos({ x: -1000, y: -1000 });
  }, []);

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
    setNodes((currentNodes) => {
      // If the number of nodes changed (e.g. new branch added), do a full layout reset
      if (currentNodes.length !== initialNodes.length) {
        return initialNodes;
      }
      
      // Otherwise, just update the data/type to preserve user-dragged positions
      return currentNodes.map((cn) => {
        const matchingInitialNode = initialNodes.find((n) => n.id === cn.id);
        if (!matchingInitialNode) return cn;
        return {
          ...cn,
          data: matchingInitialNode.data,
          // We intentionally DO NOT update cn.position here so dragging is preserved!
        };
      });
    });
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
    <div className="flex-1 flex flex-col h-full bg-[#000000]">
      <div 
        className="flex-1 relative overflow-hidden"
        ref={containerRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {/* Base Starfield Background Layer — diagonal staggered pattern */}
        <div className="absolute inset-0 z-0 pointer-events-none" style={{
          backgroundSize: '28px 28px',
          backgroundPosition: '0 0, 14px 14px',
          backgroundImage: 'radial-gradient(circle, #252525 0.6px, transparent 0.6px), radial-gradient(circle, #252525 0.6px, transparent 0.6px)'
        }} />
        
        {/* Interactive Highlighted Dot Spotlight — diagonal staggered pattern */}
        <div 
          className="absolute inset-0 z-0 pointer-events-none transition-opacity duration-300"
          style={{ 
            backgroundSize: '28px 28px',
            backgroundPosition: '0 0, 14px 14px',
            backgroundImage: 'radial-gradient(circle, #505050 0.6px, transparent 0.6px), radial-gradient(circle, #505050 0.6px, transparent 0.6px)',
            maskImage: `radial-gradient(120px circle at ${mousePos.x}px ${mousePos.y}px, black, transparent)`,
            WebkitMaskImage: `radial-gradient(120px circle at ${mousePos.x}px ${mousePos.y}px, black, transparent)`
          }} 
        />

        {/* React Flow Canvas Layer */}
        <ReactFlow
          className="relative z-10"
          nodes={nodesWithCard}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          onInit={(instance) => {
            // Force fit view slightly after mount when nodes have guaranteed layout
            setTimeout(() => {
              instance.fitView({ padding: 0.2 });
            }, 50);
          }}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.2, maxZoom: 1.2 }}
          minZoom={0.1}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
          defaultEdgeOptions={{
            type: 'default',
          }}
        >
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
