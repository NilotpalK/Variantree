/**
 * Branch color palette matching the user's exact specification.
 * Each branch gets a distinct color for consistent identification.
 */

export const BRANCH_COLORS = [
  '#4ade80', // green (main)
  '#38bdf8', // cyan/teal (hello)
  '#a855f7', // purple (fd)
  '#f97316', // orange (dsds)
  '#f472b6', // pink (fdfd)
  '#facc15', // yellow
  '#34d399', // mint
  '#60a5fa', // blue
  '#f87171', // red
  '#a78bfa', // violet
] as const;

/**
 * Get a consistent color for a branch based on its index.
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
