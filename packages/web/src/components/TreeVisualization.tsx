import { useMemo } from 'react';
import { Branch, Checkpoint } from '@variantree/core';
import { getBranchColor, getBranchColorMuted } from '../utils/branchColors';

interface TreeVisualizationProps {
  branches: Array<Branch & { isActive: boolean; messageCount: number }>;
  checkpoints: Checkpoint[];
  onSwitchBranch: (branchId: string) => void;
}

interface TreeNode {
  branch: Branch & { isActive: boolean; messageCount: number };
  children: TreeNode[];
  x: number;
  y: number;
  colorIndex: number;
}

const NODE_WIDTH = 160;
const NODE_HEIGHT = 56;
const HORIZONTAL_GAP = 60;
const VERTICAL_GAP = 80;

export default function TreeVisualization({
  branches,
  checkpoints,
  onSwitchBranch,
}: TreeVisualizationProps) {
  // Build a color map: branch id → index
  const branchColorMap = useMemo(() => {
    const map = new Map<string, number>();
    branches.forEach((b, i) => map.set(b.id, i));
    return map;
  }, [branches]);

  // Build tree structure and calculate positions
  const { nodes, connections, svgWidth, svgHeight } = useMemo(() => {
    const childrenMap = new Map<string, Branch[]>();

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
    ): TreeNode {
      const childBranches = (childrenMap.get(branch.id) || []) as Array<Branch & { isActive: boolean; messageCount: number }>;
      const children = childBranches.map((child) => buildTree(child));
      return {
        branch,
        children,
        x: 0,
        y: 0,
        colorIndex: branchColorMap.get(branch.id) ?? 0,
      };
    }

    const roots = branches
      .filter((b) => b.parentCheckpointId === null)
      .map((b) => buildTree(b));

    if (roots.length === 0) {
      return { nodes: [], connections: [], svgWidth: 0, svgHeight: 0 };
    }

    let nextX = 0;

    function layoutTree(node: TreeNode, depth: number): void {
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

    const allNodes: TreeNode[] = [];
    const allConnections: Array<{
      fromX: number;
      fromY: number;
      toX: number;
      toY: number;
      colorIndex: number;
    }> = [];

    function flatten(node: TreeNode): void {
      allNodes.push(node);
      node.children.forEach((child) => {
        allConnections.push({
          fromX: node.x + NODE_WIDTH / 2,
          fromY: node.y + NODE_HEIGHT,
          toX: child.x + NODE_WIDTH / 2,
          toY: child.y,
          colorIndex: node.colorIndex,
        });
        flatten(child);
      });
    }

    roots.forEach((root) => flatten(root));

    const maxX = Math.max(...allNodes.map((n) => n.x)) + NODE_WIDTH;
    const maxY = Math.max(...allNodes.map((n) => n.y)) + NODE_HEIGHT;

    return {
      nodes: allNodes,
      connections: allConnections,
      svgWidth: maxX + 80,
      svgHeight: maxY + 80,
    };
  }, [branches, checkpoints, branchColorMap]);

  if (nodes.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-muted">
        <p>No branches to visualize</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-screen bg-bg">
      <div className="py-4 px-6 border-b border-border flex items-center justify-between bg-bg-secondary">
        <h2 className="text-sm font-semibold text-text-primary m-0">Conversation Tree</h2>
        <span className="text-xs text-text-muted">
          {branches.length} branches · {checkpoints.length} checkpoints
        </span>
      </div>

      <div className="flex-1 overflow-auto p-10 flex items-start justify-center">
        <svg
          width={svgWidth}
          height={svgHeight}
          viewBox={`-40 -20 ${svgWidth} ${svgHeight}`}
        >
          {/* Connections — colored by parent branch */}
          {connections.map((conn, i) => {
            const midY = (conn.fromY + conn.toY) / 2;
            const color = getBranchColor(conn.colorIndex);
            return (
              <path
                key={`conn-${i}`}
                d={`M ${conn.fromX} ${conn.fromY} C ${conn.fromX} ${midY}, ${conn.toX} ${midY}, ${conn.toX} ${conn.toY}`}
                fill="none"
                stroke={color}
                strokeWidth={2}
                strokeOpacity={0.4}
              />
            );
          })}

          {/* Nodes — colored by branch */}
          {nodes.map((node) => {
            const branchCheckpoints = checkpoints.filter(
              (cp) => cp.branchId === node.branch.id
            );
            const color = getBranchColor(node.colorIndex);
            const muted = getBranchColorMuted(node.colorIndex, 0.08);
            const mutedBorder = getBranchColorMuted(node.colorIndex, 0.3);

            return (
              <g
                key={node.branch.id}
                className="tree-node-group"
                onClick={() => onSwitchBranch(node.branch.id)}
                style={{ cursor: 'pointer' }}
              >
                {/* Node background */}
                <rect
                  x={node.x}
                  y={node.y}
                  width={NODE_WIDTH}
                  height={NODE_HEIGHT}
                  rx={8}
                  fill={node.branch.isActive ? muted : 'var(--color-bg-elevated)'}
                  stroke={node.branch.isActive ? color : mutedBorder}
                  strokeWidth={node.branch.isActive ? 1.5 : 1}
                  className="tree-node-rect"
                />



                {/* Branch name */}
                <text
                  x={node.x + 14}
                  y={node.y + 22}
                  className="tree-node-label"
                  textAnchor="start"
                  fill={node.branch.isActive ? color : 'var(--color-text-primary)'}
                >
                  {node.branch.name.length > 14
                    ? node.branch.name.slice(0, 12) + '…'
                    : node.branch.name}
                </text>

                {/* Meta info */}
                <text
                  x={node.x + 14}
                  y={node.y + 40}
                  className="tree-node-meta-text"
                  textAnchor="start"
                >
                  {node.branch.messageCount} msgs
                  {branchCheckpoints.length > 0
                    ? ` · ${branchCheckpoints.length} cp`
                    : ''}
                </text>

                {/* Active indicator dot */}
                {node.branch.isActive && (
                  <circle
                    cx={node.x + NODE_WIDTH - 14}
                    cy={node.y + NODE_HEIGHT / 2}
                    r={4}
                    fill={color}
                    style={{ filter: `drop-shadow(0 0 4px ${color})` }}
                  />
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
