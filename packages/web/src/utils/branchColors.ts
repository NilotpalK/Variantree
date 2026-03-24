/**
 * Branch color palette matching the user's exact specification.
 * Each branch gets a distinct color for consistent identification.
 */

export const BRANCH_COLORS = [
  // Original 10
  '#4ade80', // green
  '#38bdf8', // cyan/teal
  '#a855f7', // purple
  '#f97316', // orange
  '#f472b6', // pink
  '#facc15', // yellow
  '#34d399', // mint
  '#60a5fa', // blue
  '#f87171', // red
  '#a78bfa', // violet
  // Extended distinct vibrant colors
  '#fbbf24', // amber
  '#fb923c', // light orange
  '#e879f9', // fuchsia
  '#c084fc', // light purple
  '#2dd4bf', // bright teal
  '#818cf8', // indigo
  '#fb7185', // rose
  '#a3e635', // lime
  '#22d3ee', // bright cyan
  '#84cc16', // darker lime
  '#10b981', // emerald
  '#6366f1', // deep indigo
  '#ec4899', // deep pink
  '#14b8a6', // deep teal
  '#8b5cf6', // deep violet
  '#fca5a5', // light red
  '#93c5fd', // light blue
  '#6ee7b7', // light mint
  '#d8b4fe', // light indigo
  '#fcd34d', // warm yellow
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
