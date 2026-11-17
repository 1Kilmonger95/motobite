// Guarda el id de reserva para poder retomar el proceso si el cliente recarga o cierra la página.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const key = (token: string) => `motobite:res:${token.slice(0, 16)}`;

export function readReservation(token: string): string | null {
  try {
    const v = localStorage.getItem(key(token));
    return v && UUID.test(v) ? v : null;
  } catch {
    return null;
  }
}

export function saveReservation(token: string, id: string): void {
  try {
    localStorage.setItem(key(token), id);
  } catch {
    /* sin almacenamiento: la reserva sigue válida en el servidor, solo no se podrá retomar */
  }
}

export function clearReservation(token: string): void {
  try {
    localStorage.removeItem(key(token));
  } catch {
    /* nada que limpiar */
  }
}
