/** Teia's user-facing 100% corresponds to a half-scale graph viewport. */
export const SPAGBOL_ZOOM_BASELINE = 0.5;

function normalizedZoom(zoom: number): number {
  return Number.isFinite(zoom) && zoom > 0 ? zoom : SPAGBOL_ZOOM_BASELINE;
}

export function spagbolZoomPercentage(zoom: number): string {
  return `${Math.round((normalizedZoom(zoom) / SPAGBOL_ZOOM_BASELINE) * 100)}%`;
}

export function spagbolHeaderTitleScale(zoom: number): number {
  const userZoom = normalizedZoom(zoom) / SPAGBOL_ZOOM_BASELINE;
  if (userZoom <= 0.3) return 2.2;
  if (userZoom <= 0.5) return 1.75;
  if (userZoom < 0.7) return 1.3;
  return 1;
}
