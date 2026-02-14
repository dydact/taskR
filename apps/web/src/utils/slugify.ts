/**
 * Generates a URL-friendly slug from a string.
 * Converts to lowercase, replaces spaces with hyphens,
 * removes special characters, and trims leading/trailing hyphens.
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Generates a unique slug by appending a short random suffix.
 */
export function slugifyUnique(text: string): string {
  const base = slugify(text);
  const suffix = Math.random().toString(36).substring(2, 6);
  return `${base}-${suffix}`;
}

export default slugify;
