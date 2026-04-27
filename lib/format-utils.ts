/**
 * Pure formatting helpers shared between server and client.
 */

const KB = 1024;
const MB = KB * 1024;

export function formatBytes(bytes: number): string {
  if (bytes < KB) return `${bytes} B`;
  if (bytes < MB) return `${(bytes / KB).toFixed(1)} KB`;
  return `${(bytes / MB).toFixed(1)} MB`;
}

/** Builds an absolute URL for an in-app path using the request's origin. */
export function buildAbsoluteUrl(origin: string, path: string): string {
  const trimmedOrigin = origin.replace(/\/+$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${trimmedOrigin}${normalizedPath}`;
}
