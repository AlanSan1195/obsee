# Planes de implementación — OBSREC

Generados por la skill `improve` el 2026-06-10, sobre el commit `86bec05`.
Ejecutar en el orden de la tabla salvo que las dependencias indiquen otra
cosa. Cada ejecutor: lee el plan completo antes de empezar, respeta sus
condiciones de STOP y actualiza tu fila al terminar.

Comandos de verificación del repo: `pnpm run typecheck`, `pnpm run lint`
(ambos en verde en `86bec05`); `pnpm test` existe a partir del plan 003.

## Orden de ejecución y estado

| Plan | Título | Prioridad | Esfuerzo | Depende de | Estado |
|------|--------|-----------|----------|------------|--------|
| 001  | Hacer que `pnpm run dev` cargue el servidor de Vite | P1 | S | — | TODO |
| 002  | Eliminar código muerto duplicado y endurecer el empaquetado | P1 | S | — | TODO |
| 003  | Establecer la base de tests con Vitest | P1 | M | 002 (recomendado) | TODO |
| 004  | Actualizar Electron y electron-builder (CVEs) | P2 | M | 003 (recomendado) | TODO |
| 005  | Notificar al renderer cuando OBS se desconecta | P2 | M | — | TODO |
| 006  | Unificar idioma, accesibilidad y fallback de IA visible | P2 | M | 005 (recomendado) | TODO |
| 007  | Respaldo automático antes de aplicar y restauración | P2 | M/L | 003, 006 | TODO |
| 008  | Audio etapa 2: ruido, monitoreo, lip sync y ducking | P3 | L | 003, 006; mejor tras 007 | TODO |

Valores de estado: TODO | IN PROGRESS | DONE | BLOCKED (con motivo de una línea) | REJECTED (con justificación de una línea)

## Notas de dependencias

- **003 después de 002**: para no escribir tests sobre código muerto que se va
  a borrar, y porque 002 simplifica los imports de tipos que 003 usa.
- **004 después de 003**: la suite de tests es la red de seguridad del upgrade
  de Electron (33 → ≥39.8.5).
- **006 después de 005**: ambos tocan `App.tsx`; 005 introduce mensajes de
  estado que 006 deja en español definitivo.
- **007 después de 006**: 007 consume las `warnings` estructuradas que 006
  introduce en `configureAudio`, y su diálogo reemplaza el `window.confirm`.
- **008 al final**: modifica `getFilterSettings`/`areObsrecFiltersConfigured`
  (testeados en 003) y reutiliza el `ConfirmDialog` de 007.

## Hallazgos considerados y rechazados / no planificados

- **`areObsrecFiltersConfigured` compara contra defaults fijos**
  (`obs-manager.ts:215`): hoy la UI solo aplica esos defaults, así que es
  consistente; se vuelve relevante solo si los filtros se hacen editables
  (el plan 008 lo toca de paso).
- **Rotación `getNextService` con un solo servicio**
  (`src/main/ai/serviceManager.ts`): cosmética; cobra sentido cuando se
  agregue el fallback de Cerebras (intención visible en `.env.example`, no
  seleccionado en esta ronda).
- **`connect()` devuelve "Already connected" ignorando settings nuevos**:
  la UI oculta el formulario estando conectado, no hay ruta real al problema.
- **CI de GitHub Actions** (hallazgo #6) y **CLAUDE.md** (hallazgo #8):
  válidos y baratos, pero no seleccionados en esta ronda — candidatos
  naturales para la siguiente.
- **Persistir ajustes de conexión de OBS** (dirección D1, prometido en el
  README) y **fallback Cerebras** (D3): no seleccionados en esta ronda.
- **Actualizar Vite 5→7, groq-sdk, React**: sin CVEs en el uso actual; costo
  sin beneficio inmediato. Reevaluar tras 004.
