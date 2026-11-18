import jsQR from "jsqr";

// Decodifica un QR desde los píxeles de una imagen. Devuelve su texto o null.
export function decodeQr(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  invert: "dontInvert" | "attemptBoth" = "dontInvert"
): string | null {
  const r = jsQR(data, width, height, { inversionAttempts: invert });
  return r ? r.data : null;
}
