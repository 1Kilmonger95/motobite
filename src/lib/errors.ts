export function friendlyError(e: { code?: string; message?: string } | null | undefined): string {
  if (!e) return "";
  if (e.code === "23514") return "Algún dato no cumple las reglas. Revisa que el enlace sea de Google Drive.";
  if (e.code === "42501") return "No tienes permisos para realizar esta acción.";
  if (e.message && /fetch|network/i.test(e.message)) {
    return "No hay conexión con el servidor. Revisa tu Internet e inténtalo de nuevo.";
  }
  return "Ocurrió un error inesperado. Inténtalo de nuevo.";
}
