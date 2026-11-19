# MotoBite

Distribución de documentos PDF mediante chips NFC y códigos QR.
React + TypeScript + Vite + Tailwind · Supabase (PostgreSQL, Auth, Edge Functions) · IndexedDB · PWA · GitHub Pages.

Los PDF **no** se guardan en ningún servidor: viven en Google Drive (origen) y en el teléfono del cliente (IndexedDB).
Supabase solo guarda chips, huellas (hash) de los enlaces, estados y el historial de activaciones.

## Cómo funciona
1. El administrador registra un chip con el enlace de Drive del PDF y genera un enlace de activación (token de 256 bits, un solo uso, con vencimiento).
2. Graba el chip NFC desde el propio panel (botón «Grabar chip NFC», en Chrome para Android) y entrega también el QR (descargable o en una tarjeta imprimible). El cliente usa el que prefiera.
3. El cliente acerca el teléfono al chip o escanea el QR (con la cámara o con «Escanear código QR» dentro de MotoBite, útil en teléfonos sin NFC y en la app instalada del iPhone). Abre el enlace, elige o descarga el PDF; MotoBite lo guarda en IndexedDB, lo relee y comprueba tamaño y SHA-256.
4. Solo entonces el servidor confirma y consume el enlace. Si algo falla antes, el enlace no se consume.
5. Después, al volver a tocar el chip o escanear el QR en ese mismo teléfono, el documento se abre directamente, con o sin Internet. Sin el documento y sin Internet, MotoBite avisa que necesita conexión y reintenta solo cuando vuelve.

## Puesta en marcha
**Supabase**
1. SQL Editor: ejecutar en orden `supabase/migrations/001`, `002`, `003` (con tu correo) y `004`. Después, cada archivo de `supabase/tests/` debe terminar con el error «PRUEBAS OK».
2. Edge Functions: crear una función con el código de `supabase/functions/admin-tokens/index.ts`, con **Verify JWT desactivado** (la función valida cada acción por sí misma).
3. Opcional: secreto `ALLOWED_ORIGIN` = `https://TU-USUARIO.github.io` y, si hace falta, `RATE_IP_PER_MIN` / `RATE_TOKEN_PER_MIN`.
4. Authentication: crear tu usuario administrador y desactivar el registro público.

**GitHub**
1. Settings → Pages → Source: GitHub Actions.
2. Settings → Secrets and variables → Actions → Variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
3. Cada push a `main` compila y publica.

**El nombre de la función** que usa el frontend está en `src/lib/functions.ts`.

## Seguridad
- Tokens aleatorios de 256 bits; en la base solo se guarda su SHA-256.
- Reserva temporal + confirmación atómica (bloqueo de fila) contra activaciones simultáneas.
- RLS en todas las tablas; las operaciones sensibles solo pasan por funciones SQL que ejecuta únicamente `service_role`, desde la Edge Function.
- La clave `service_role` solo existe en Supabase. Nunca va al frontend ni al repositorio.
- Límite de intentos por enlace y por IP (no se guarda la IP real).
- El identificador de instalación del dispositivo es de mejor esfuerzo, no una protección infalible.
- El servidor no puede comprobar que el PDF quedó guardado en el teléfono: confía en el cliente y en una reserva vigente.

## Límites conocidos
- La descarga directa desde Google Drive suele bloquearse por CORS; entonces el cliente abre Drive y elige el PDF.
- Los navegadores pueden borrar datos locales. Si el cliente cambia de teléfono o borra los datos, necesita una nueva activación.
- iPhone: Safari borra los datos del sitio tras días sin uso; la app instalada en la pantalla de inicio no. MotoBite guía la instalación. Web NFC (grabar chips) solo funciona en Chrome para Android.
- Los iPhone anteriores al XS no leen chips NFC sin app: usar el QR.

Lista de pruebas: `docs/PRUEBAS.md`.
