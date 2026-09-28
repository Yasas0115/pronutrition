// Product photos are stored as a JSON array of data: URLs in Product.images,
// with the first entry mirrored into Product.imageUrl as the cover. These
// helpers keep parsing/serialising in one place (server + client safe).

/** Parse the stored `images` JSON into a clean list of data: URLs. */
export function parseImages(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter((s): s is string => typeof s === 'string' && s.length > 0);
  } catch {
    return [];
  }
}

/**
 * Resolve a product's gallery for display: prefer the stored gallery, but fall
 * back to the legacy single `imageUrl` for rows saved before galleries existed.
 */
export function galleryOf(p: { images?: string | null; imageUrl?: string | null }): string[] {
  const list = parseImages(p.images);
  if (list.length) return list;
  return p.imageUrl ? [p.imageUrl] : [];
}
