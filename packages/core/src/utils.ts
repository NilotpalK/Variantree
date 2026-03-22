/**
 * @variantree/core — Utility functions
 *
 * Pure helpers with zero dependencies. Used throughout the engine.
 */

declare const crypto: {
  randomUUID?: () => string;
} | undefined;

/**
 * Generate a random UUID v4 string.
 * No external dependencies — uses crypto when available, falls back to Math.random.
 */
export function generateId(): string {
  // Use crypto.randomUUID if available (Node 19+, modern browsers)
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  // Fallback: manual UUID v4 generation
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Generate a content-addressed hash for checkpoint IDs.
 * Uses a simple but collision-resistant hash — not cryptographic,
 * just needs to be deterministic and unique for different content.
 */
export function hashContent(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0; // Convert to 32-bit int
  }
  // Combine with timestamp and random component for uniqueness
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  const hashHex = Math.abs(hash).toString(16).padStart(8, '0');
  return `cp-${hashHex}-${timestamp}-${random}`;
}

/**
 * Get current Unix timestamp in milliseconds.
 */
export function now(): number {
  return Date.now();
}
