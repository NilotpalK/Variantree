/**
 * VS Code-style neon color palette for branch visualization.
 * Each branch gets assigned a distinct color for consistent
 * identification across the sidebar and full tree view.
 */

export const BRANCH_COLORS = [
  '#00d084', // neon green (primary)
  '#00bfff', // neon cyan
  '#c084fc', // neon purple
  '#fb923c', // neon orange
  '#f472b6', // neon pink
  '#facc15', // neon yellow
  '#34d399', // neon mint
  '#60a5fa', // neon blue
  '#f87171', // neon red
  '#a78bfa', // neon violet
] as const;

/**
 * Get a consistent color for a branch based on its index.
 * Cycles through the palette if there are more branches than colors.
 */
export function getBranchColor(branchIndex: number): string {
  return BRANCH_COLORS[branchIndex % BRANCH_COLORS.length];
}

/**
 * Get a muted (translucent) version of a branch color for backgrounds.
 */
export function getBranchColorMuted(branchIndex: number, opacity = 0.15): string {
  const color = BRANCH_COLORS[branchIndex % BRANCH_COLORS.length];
  return hexToRgba(color, opacity);
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
