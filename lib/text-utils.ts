/**
 * Shared text normalization utilities for consistent Unicode handling.
 * All text normalization across the codebase should use these functions.
 */

/**
 * Normalizes text for display and comparison:
 * - Applies Unicode NFC normalization (combining characters)
 * - Collapses repeated whitespace (including Unicode whitespace)
 * - Trims leading/trailing whitespace
 *
 * @param text - Input text to normalize
 * @returns Normalized text with consistent whitespace and Unicode representation
 *
 * @example
 * normalizeText("  Hello\u0301  World  ") // => "Hello\u00ED World"
 * normalizeText("a\u0301") === normalizeText("\u00E1") // true (same character)
 * normalizeText("  multiple   spaces  ") // => "multiple spaces"
 * normalizeText("tab\there") // => "tab here"
 */
export function normalizeText(text: string): string {
  return text.normalize("NFC").replace(/\s+/gu, " ").trim();
}

/**
 * Normalizes text and splits into words.
 * Useful for word-level processing while maintaining normalization.
 *
 * @param text - Input text to normalize and split
 * @returns Array of normalized words (empty strings removed)
 *
 * @example
 * normalizeAndSplitWords("  Hello   World  ") // => ["Hello", "World"]
 */
export function normalizeAndSplitWords(text: string): string[] {
  return normalizeText(text).split(" ").filter(Boolean);
}
