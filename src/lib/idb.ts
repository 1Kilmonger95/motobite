import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { sha256Hex } from "./hash";

export type DocMeta = {
  id: string;
  name: string;
  description: string;
  size: number;
  sha256: string;
  savedAt: string;
  source: "drive" | "local";
  status: "pending" | "active"; // "pending": guardado pero aún sin confirmar en el servidor
  activationKey: string | null;
};

interface MotoDB extends DBSchema {
  documents: { key: string; value: DocMeta; indexes: { "by-activation": string } };
  files: { key: string; value: Blob };
}

export class StorageError extends Error {
  code: "quota" | "unavailable" | "verify" | "idb";
  constructor(code: StorageError["code"], message: string) {
    super(message);
    this.code = code;
  }
}

let dbPromise: Promise<IDBPDatabase<MotoDB>> | null = null;

async function getDb(): Promise<IDBPDatabase<MotoDB>> {
  if (typeof indexedDB === "undefined") {
    throw new StorageError("unavailable", "IndexedDB no está disponible.");
  }
  if (!dbPromise) {
    dbPromise = openDB<MotoDB>("motobite", 1, {
      upgrade(d) {
        const docs = d.createObjectStore("documents", { keyPath: "id" });
        docs.createIndex("by-activation", "activationKey");
        d.createObjectStore("files");
      }
    });
    dbPromise.catch(() => {
      dbPromise = null;
    });
  }
  return dbPromise;
}

function classify(e: unknown): StorageError {
  if (e instanceof StorageError) return e;
  const name = (e as { name?: string } | null)?.name ?? "";
  if (name === "QuotaExceededError") return new StorageError("quota", "No hay espacio suficiente.");
  if (name === "SecurityError" || name === "InvalidStateError") {
    return new StorageError("unavailable", "El navegador no permite guardar archivos.");
  }
  return new StorageError("idb", "Error al usar el almacenamiento del navegador.");
}

// Pide almacenamiento persistente, pero NUNCA bloquea el guardado: algunos navegadores (Firefox) muestran un aviso
// de permiso y no responden hasta que la persona decide, así que no se espera más de 1,5 s.
async function requestPersistence(): Promise<void> {
  try {
    if (!navigator.storage?.persist) return;
    await Promise.race([
      (async () => {
        if (!(await navigator.storage.persisted?.())) await navigator.storage.persist();
      })(),
      new Promise<void>((resolve) => setTimeout(resolve, 1500))
    ]);
  } catch {
    /* es una petición de mejor esfuerzo */
  }
}

export async function saveAndVerify(
  blob: Blob,
  input: { name: string; description: string; source: "drive" | "local"; activationKey: string }
): Promise<DocMeta> {
  let id = "";
  try {
    await requestPersistence();
    const original = await blob.arrayBuffer();
    const sha256 = await sha256Hex(original);
    const meta: DocMeta = {
      id: crypto.randomUUID(),
      name: input.name,
      description: input.description,
      size: blob.size,
      sha256,
      savedAt: new Date().toISOString(),
      source: input.source,
      status: "pending",
      activationKey: input.activationKey
    };
    id = meta.id;

    const database = await getDb();
    const tx = database.transaction(["documents", "files"], "readwrite");
    await Promise.all([tx.objectStore("files").put(blob, meta.id), tx.objectStore("documents").put(meta), tx.done]);

    // Verificación: se vuelve a leer desde IndexedDB y se compara tamaño y contenido (SHA-256).
    const stored = await database.get("files", meta.id);
    const ok = !!stored && stored.size === blob.size && (await sha256Hex(await stored.arrayBuffer())) === sha256;
    if (!ok) throw new StorageError("verify", "El archivo guardado no coincide con el original.");
    return meta;
  } catch (e) {
    if (id) await deleteDocument(id).catch(() => undefined);
    throw classify(e);
  }
}

export async function listDocuments(): Promise<DocMeta[]> {
  const all = await (await getDb()).getAll("documents");
  return all.filter((d) => d.status === "active").sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

export async function getMeta(id: string): Promise<DocMeta | undefined> {
  return (await getDb()).get("documents", id);
}

export async function getBlob(id: string): Promise<Blob | undefined> {
  return (await getDb()).get("files", id);
}

export async function markActive(id: string): Promise<void> {
  const database = await getDb();
  const meta = await database.get("documents", id);
  if (!meta) throw new StorageError("idb", "No se encontró el documento guardado.");
  // Se conserva activationKey: así, volver a abrir el mismo enlace (chip o QR) abre el documento directamente.
  await database.put("documents", { ...meta, status: "active" });
}

export async function deleteDocument(id: string): Promise<void> {
  const database = await getDb();
  const tx = database.transaction(["documents", "files"], "readwrite");
  await Promise.all([tx.objectStore("documents").delete(id), tx.objectStore("files").delete(id), tx.done]);
}

export async function findPendingByActivation(key: string): Promise<DocMeta | undefined> {
  const rows = await (await getDb()).getAllFromIndex("documents", "by-activation", key);
  return rows.find((d) => d.status === "pending");
}

export async function deletePendingByActivation(key: string): Promise<void> {
  const rows = await (await getDb()).getAllFromIndex("documents", "by-activation", key);
  for (const d of rows) if (d.status === "pending") await deleteDocument(d.id);
}

// Comprueba que el archivo guardado sigue íntegro (mismo tamaño y mismo SHA-256 que al guardarlo).
export async function verifyDocument(id: string): Promise<boolean> {
  const [meta, blob] = await Promise.all([getMeta(id), getBlob(id)]);
  if (!meta || !blob || blob.size !== meta.size) return false;
  return (await sha256Hex(await blob.arrayBuffer())) === meta.sha256;
}

// Documento ya activado en este teléfono a partir de este enlace (si existe).
export async function findActiveByActivation(key: string): Promise<DocMeta | undefined> {
  const rows = await (await getDb()).getAllFromIndex("documents", "by-activation", key);
  return rows.filter((d) => d.status === "active").sort((a, b) => b.savedAt.localeCompare(a.savedAt))[0];
}

// Comprobación rápida (sin recalcular el SHA-256): el archivo existe y su tamaño coincide.
export async function quickCheck(id: string): Promise<boolean> {
  const [meta, blob] = await Promise.all([getMeta(id), getBlob(id)]);
  return !!meta && !!blob && blob.size === meta.size;
}
