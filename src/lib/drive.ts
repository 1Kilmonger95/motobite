const DRIVE_URL = /^https:\/\/(drive|docs)\.google\.com\//;

export function isDriveUrl(url: string): boolean {
  return DRIVE_URL.test(url.trim());
}

// Intenta obtener el ID del archivo; si el formato no se reconoce devuelve null.
export function extractDriveFileId(url: string): string | null {
  const u = url.trim();
  const byPath = u.match(/\/d\/([A-Za-z0-9_-]{10,})/);
  if (byPath) return byPath[1];
  const byQuery = u.match(/[?&]id=([A-Za-z0-9_-]{10,})/);
  return byQuery ? byQuery[1] : null;
}
