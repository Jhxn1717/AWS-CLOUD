/**
 * slugify.ts
 * Converts a project name to a URL-safe slug.
 */

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')   // remove non-alphanumeric except spaces/hyphens
    .replace(/\s+/g, '-')            // spaces → hyphens
    .replace(/-+/g, '-')             // collapse multiple hyphens
    .replace(/^-+|-+$/g, '');        // trim leading/trailing hyphens
}

/**
 * Appends a short random suffix to guarantee uniqueness.
 */
export function uniqueSlug(name: string): string {
  const base = slugify(name);
  const suffix = Math.random().toString(36).substring(2, 7);
  return `${base}-${suffix}`;
}
