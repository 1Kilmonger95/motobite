const KEY = "motobite:installation";
let memoryId: string | null = null;

// Identificador de mejor esfuerzo de esta instalación (no es una protección infalible).
export function getInstallationId(): string {
  try {
    let v = localStorage.getItem(KEY);
    if (!v || v.length < 16) {
      v = crypto.randomUUID();
      localStorage.setItem(KEY, v);
    }
    return v;
  } catch {
    if (!memoryId) memoryId = crypto.randomUUID();
    return memoryId;
  }
}

export function getDeviceLabel(): string {
  const ua = navigator.userAgent;
  const os = /Android/i.test(ua) ? "Android" : /iPhone|iPad|iPod/i.test(ua) ? "iOS" : /Windows/i.test(ua) ? "Windows"
    : /Mac OS X/i.test(ua) ? "macOS" : /Linux/i.test(ua) ? "Linux" : "Dispositivo";
  const br = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox"
    : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Navegador";
  return `${os} · ${br}`;
}
