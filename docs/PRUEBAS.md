# Pruebas de MotoBite

Leyenda: ✅ verificado automáticamente · 👤 lo confirmas tú en tu dispositivo · ⏳ pendiente (necesita hardware).

## Las 15 pruebas obligatorias
| # | Prueba | Estado |
|---|--------|--------|
| 1 | El administrador inicia sesión | 👤 (la usaste) |
| 2 | Registra chips | 👤 |
| 3 | Asocia enlaces de Google Drive | 👤 |
| 4 | Genera enlaces y QR | 👤 (QR escaneado) |
| 5 | El cliente abre un enlace válido | ✅ navegador real + 👤 |
| 6 | Selecciona un PDF local | ✅ Firefox y Chromium · 👤 en tu teléfono |
| 7 | El PDF se guarda completo en IndexedDB | ✅ (tamaño + SHA-256, byte a byte) |
| 8 | Se recupera y abre sin conexión | ✅ Chromium 6/6 · 👤 en tu teléfono (modo avión) |
| 9 | El token no se consume antes de verificar | ✅ SQL y navegador (archivo inválido, caída del servidor) |
| 10 | El token se consume al completar | ✅ SQL y navegador |
| 11 | Un token consumido no se reutiliza | ✅ SQL y navegador |
| 12 | Un token vencido no permite activar | ✅ SQL · 👤 pantalla «Enlace vencido» (genera uno de 24 h y espera) |
| 13 | Revocar y emitir nuevos enlaces | ✅ SQL · 👤 desde el panel |
| 14 | La PWA funciona sin conexión | ✅ Chromium · 👤 instalada en Android |
| 15 | Las operaciones sensibles están protegidas | ✅ permisos SQL, 401/403, límites de intentos |

## Qué cubren las pruebas automáticas
- `supabase/tests/test_activation.sql` y `test_hardening.sql`: reglas de activación, permisos y límites (ejecutar en el SQL Editor; deben terminar en «PRUEBAS OK»).
- Navegador real (Firefox y Chromium): activación completa, archivos vacío / no PDF / truncado / .txt, segundo dispositivo, reintento tras recargar, caída del servidor entre guardar y confirmar, enlace ya usado, visor de PDF, apertura sin servidor y error claro sin conexión.

- Panel con lector NFC simulado (Chromium): «Grabar chip NFC» siempre visible, un clic genera el enlace y graba un registro URL, revoca el enlace anterior, no guarda el token en claro, «Verificar chip», QR, tarjeta imprimible, y navegador sin NFC (motivo claro, flujo por QR).
- Escáner de QR (Chromium con cámara simulada que muestra un QR real): lee el QR y abre la activación, QR ajeno rechazado, foto del código, cámara denegada con alternativa.

## Pruebas que solo puedes hacer tú (hardware)
1. ⏳ Grabar un chip desde el panel (Chrome en Android, NFC activado) y pulsar «Verificar chip».
2. ⏳ Acercar el teléfono al chip grabado: abre la página de activación.
3. ⏳ Activar con un PDF real y abrirlo en modo avión.
4. ⏳ Descarga directa desde Drive: probar; si falla, debe ofrecer «Abrir Google Drive» y «Elegir el PDF descargado».
5. ⏳ iPhone (XS o posterior): chip → Safari → guía de instalación → «Activar con un enlace» en la app instalada.
6. ⏳ Cambio de teléfono: generar un enlace nuevo y activar en otro dispositivo; el anterior queda «Reemplazado».
7. ⏳ Cámara real: «Escanear código QR» en Mis documentos con el QR de una tarjeta impresa.
8. ⏳ Imprimir la tarjeta con QR en papel y escanearla.
9. ⏳ Actualización: tras publicar una versión nueva debe aparecer «Hay una versión nueva de MotoBite» con el botón Actualizar.

## Limitaciones de la prueba automática
- No se probó en Safari/iOS, con chips físicos ni con la cámara o la impresora de un teléfono real: se usaron un lector NFC simulado y una cámara simulada.
- En Firefox automatizado, la apertura sin conexión falló de forma intermitente (la carga del script de la app quedaba colgada); en Chromium fue estable.
