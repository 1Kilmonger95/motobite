const TOKEN = /^[A-Za-z0-9_-]{43}$/;

// Acepta el enlace completo de activación o solo el token y devuelve el token (o null si no es válido).
export function parseActivationInput(input: string): string | null {
  const text = input.trim();
  if (TOKEN.test(text)) return text;
  const m = text.match(/#\/a\/([A-Za-z0-9_-]{43})(?![A-Za-z0-9_-])/);
  return m ? m[1] : null;
}

export function isIosDevice(ua: string, platform: string, touchPoints: number): boolean {
  return /iPad|iPhone|iPod/.test(ua) || (platform === "MacIntel" && touchPoints > 1); // iPadOS se identifica como Mac
}

export function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true || window.matchMedia("(display-mode: standalone)").matches;
}

export function isIos(): boolean {
  return isIosDevice(navigator.userAgent, navigator.platform, navigator.maxTouchPoints);
}

// iPhone/iPad usando el navegador (no la app instalada en la pantalla de inicio).
export function isIosBrowserTab(): boolean {
  return isIos() && !isStandalone();
}
