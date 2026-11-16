# MotoBite

Distribución de PDF mediante NFC/QR. React + TypeScript + Vite + Tailwind + Supabase + IndexedDB + PWA.

## Inicio rápido
1. `cp .env.example .env.local` y completa URL y anon key de Supabase.
2. `npm install`
3. `npm run typecheck`
4. `npm run dev`

## Despliegue (GitHub Pages)
- Settings > Pages > Source: GitHub Actions.
- Settings > Secrets and variables > Actions > Variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
- Push a `main`.

Nunca subas la `service_role` al repositorio.
