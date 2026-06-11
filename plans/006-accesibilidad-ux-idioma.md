# Plan 006: Unificar el idioma de la UI, mejorar accesibilidad y hacer visible el fallback de IA

> **Instrucciones para el ejecutor**: Sigue este plan paso a paso. Ejecuta cada
> comando de verificación y confirma el resultado esperado antes de avanzar.
> Si ocurre algo de la sección "Condiciones de STOP", detente y reporta — no
> improvises. Al terminar, actualiza la fila de este plan en `plans/README.md`.
>
> **Chequeo de deriva (ejecutar primero)**: `git diff --stat 86bec05..HEAD -- src/renderer src/shared/localRecommendation.ts src/shared/types.ts src/main/index.ts src/main/obs-manager.ts`
> Si algún archivo en alcance cambió desde que se escribió este plan, compara
> los extractos de "Estado actual" contra el código vivo antes de continuar;
> si no coinciden, trátalo como condición de STOP. (Cambios esperados de los
> planes 003 y 005 en `obs-manager.ts`/`App.tsx` NO son deriva.)

## Estado

- **Prioridad**: P2
- **Esfuerzo**: M
- **Riesgo**: LOW
- **Depende de**: plans/005-notificar-desconexion-obs.md (recomendado: toca `App.tsx`; ejecutar después evita conflictos)
- **Categoría**: dx / ux / a11y
- **Planeado en**: commit `86bec05`, 2026-06-10

## Por qué importa

La UI mezcla inglés y español sin criterio: el encabezado y los botones
principales están en inglés ("FIND BEST CONFIGURATION", "Auto-configure OBS
for optimal streaming & recording", la tabla "OBS Diagnosis"), mientras toda
la sección de audio y los mensajes de error están en español. Además hay
problemas de accesibilidad concretos (botón de cerrar error "×" sin nombre
accesible, errores que un lector de pantalla nunca anuncia, indicador de
estado comunicado solo por color) y dos fallas de transparencia: cuando la IA
falla, la app cae silenciosamente a la recomendación local sin decírselo al
usuario, y las advertencias de audio durante la importación se pierden por una
comparación de strings que nunca coincide (busca `'warnings'` dentro de un
mensaje que dice `'advertencias'`).

## Estado actual

Textos en inglés a traducir (verificados en `86bec05`):

- `src/renderer/App.tsx:20` — `<p className="text-zinc-400">Auto-configure OBS for optimal streaming & recording</p>`
- `src/renderer/components/AnalyzeButton.tsx:41` — `{isDisabled ? 'Select mode and platform first' : 'FIND BEST CONFIGURATION'}`
- `src/renderer/components/OBSComparison.tsx` — encabezados "OBS Diagnosis",
  "{changeCount} changes", columnas "Setting / Current OBS / Recommended /
  Status", celdas "Keep"/"Change"/"Unknown", labels de filas ("Base canvas",
  "Output resolution", etc.)
- `src/renderer/components/ImportButton.tsx:47` — `setObsMessage('Configuration applied successfully!')`
- `src/renderer/store.ts:48` — `obsMessage: 'Disconnected from OBS'`
- `src/renderer/components/AudioConfiguration.tsx:123,211` — "Audio Setup", "Filters"
- `src/shared/localRecommendation.ts:50` — `reasoning: 'Local fallback recommendation based on ...'` (en inglés, se muestra al usuario)
- Componentes `ModeSelector.tsx`, `PlatformSelector.tsx`, `PCAnalysis.tsx`,
  `Recommendations.tsx` — revisar y traducir lo que esté en inglés (no
  inventariados aquí; inspecciónalos).

Problemas de accesibilidad:

- `src/renderer/App.tsx:23-33` — el banner de error usa un `<button>` con
  contenido `×` sin `aria-label`, y el contenedor no es una región viva
  (`role="alert"`/`aria-live`), así que los lectores de pantalla no anuncian
  errores.
- `src/renderer/components/StatusBar.tsx` — el estado conectado/desconectado
  se comunica solo con un círculo verde/rojo (`bg-green-500`/`bg-red-500`);
  el texto de `obsMessage` lo compensa en parte, pero el contenedor tampoco es
  `aria-live` (cambios de estado no se anuncian).
- `src/renderer/components/ImportButton.tsx:121-129` y otros botones — sin
  `type="button"` explícito en algunos casos; emojis decorativos (`🔌`, `⬆️`,
  `🔍`) sin `aria-hidden="true"`.
- `src/renderer/components/AudioConfiguration.tsx:106` — usa
  `window.confirm(...)` nativo (funciona, pero el texto multilínea con `\n` es
  frágil; se mantiene en este plan — reemplazarlo por un diálogo propio queda
  para el plan 007 que introduce confirmaciones ricas).

Fallback de IA silencioso — `src/main/index.ts:187-190`:

```ts
} catch (error) {
  console.error('Error getting AI recommendation:', error);
  return getLocalRecommendation(request);
}
```

El renderer no puede distinguir una recomendación de IA de una local.
`AIRecommendation` (`src/shared/types.ts:125-136`) no tiene campo de origen.

Bug de advertencias perdidas — `src/main/obs-manager.ts:562-569`:

```ts
if (config.audio) {
  const audioResult = await this.configureAudio(config.audio);
  if (!audioResult.success) {
    warnings.push(audioResult.message);
  } else if (audioResult.message.includes('warnings')) {
    warnings.push(audioResult.message);
  }
}
```

`configureAudio` construye su mensaje como `'Configuracion de audio aplicada
con advertencias: ...'` (línea 481-483) — nunca contiene `'warnings'`, así que
las advertencias se descartan.

## Comandos que necesitarás

| Propósito  | Comando               | Esperado en éxito   |
|------------|-----------------------|---------------------|
| Typecheck  | `pnpm run typecheck`  | exit 0              |
| Lint       | `pnpm run lint`       | exit 0              |
| Tests      | `pnpm test`           | todos pasan (si existe) |
| Dev        | `pnpm run dev`        | ventana carga       |

## Alcance

**En alcance**:
- Todos los archivos de `src/renderer/components/`, `src/renderer/App.tsx`,
  `src/renderer/store.ts`
- `src/shared/types.ts` (agregar `source` a `AIRecommendation`)
- `src/shared/localRecommendation.ts` (traducir `reasoning`, fijar `source`)
- `src/shared/validation.ts` (aceptar el campo `source` — ver Paso 4)
- `src/main/index.ts` (marcar `source` en la respuesta de IA)
- `src/main/obs-manager.ts` (solo el bloque de advertencias de audio citado)

**Fuera de alcance**:
- Internacionalización real (i18n con librería) — el objetivo es UNA sola
  lengua (español), no un sistema de traducción.
- Cambiar la lógica de recomendación, scoring o validación de rangos.
- Reemplazar `window.confirm` (lo hace el plan 007).
- Estilos/diseño visual más allá de los atributos de accesibilidad.

## Flujo de git

- Rama: `advisor/006-accesibilidad-ux-idioma`
- Commits separados: (1) idioma, (2) accesibilidad, (3) origen de la
  recomendación, (4) advertencias de audio. Mensajes en español.
- NO hagas push ni abras PR salvo que el operador lo indique.

## Pasos

### Paso 1: Unificar todo el texto visible en español

Traduce todos los textos listados en "Estado actual" y recorre los cuatro
componentes no inventariados (`ModeSelector`, `PlatformSelector`,
`PCAnalysis`, `Recommendations`) traduciendo lo que esté en inglés. Estilo: el
español ya usado en la app — directo, sin signos de apertura omitidos en
exceso, sin tildes en los textos existentes (el repo escribe "configuracion",
"microfono"; mantén esa convención por consistencia).

Sugerencias concretas: "FIND BEST CONFIGURATION" → "BUSCAR LA MEJOR
CONFIGURACION"; "Select mode and platform first" → "Selecciona modo y
plataforma primero"; "OBS Diagnosis" → "Diagnostico de OBS"; "Keep"/"Change" →
"Mantener"/"Cambiar"; "Configuration applied successfully!" → "Configuracion
aplicada correctamente"; `obsMessage` inicial → "Desconectado de OBS".

**Verificar**: `grep -rniE "find best|select mode|diagnosis|successfully|disconnected from" src/renderer` → sin resultados

### Paso 2: Accesibilidad

1. `App.tsx` — al banner de error: `role="alert"` en el contenedor y
   `aria-label="Cerrar mensaje de error"` en el botón `×`.
2. `StatusBar.tsx` — al contenedor del texto: `aria-live="polite"`; al punto
   de color: `aria-hidden="true"` (el texto ya describe el estado).
3. Emojis decorativos (`🔍`, `🔌`, `⬆️`) — envolver en
   `<span aria-hidden="true">`.
4. Todos los `<button>` del renderer — asegurar `type="button"` explícito.
5. `AudioConfiguration.tsx` — el `<select>` ya está dentro de `<label>`; bien.
   Verifica que los inputs de `ImportButton.tsx` conserven sus `<label>`.

**Verificar**: `pnpm run lint && pnpm run typecheck` → exit 0; `grep -c 'aria-' src/renderer/App.tsx src/renderer/components/StatusBar.tsx` → ≥ 1 en cada uno

### Paso 3: Hacer visible el origen de la recomendación (IA vs. local)

1. En `src/shared/types.ts`, agrega a `AIRecommendation` el campo:
   `source: 'ai' | 'local';`
2. En `src/shared/localRecommendation.ts`, devuelve `source: 'local'` y
   traduce el `reasoning` a español: `'Recomendacion local generada a partir de
   los nucleos de CPU, la RAM, el proveedor de GPU, la plataforma y el modo
   seleccionados (la IA no estuvo disponible).'`
3. En `src/main/index.ts`, en el handler `ai:get-recommendation`, agrega
   `source: 'ai'` al objeto devuelto cuando la recomendación viene de la IA
   (tras `validateAIRecommendation`): `return { ...recommendation.value, source: 'ai' as const };`
4. En `src/shared/validation.ts`, `validateAIRecommendation` construye el
   objeto de retorno — NO exijas `source` en la entrada (la IA no lo envía);
   el campo se añade después, en los puntos 2 y 3. Si TypeScript exige el
   campo en el objeto literal de `validation.ts:300-314`, cambia el tipo de
   retorno de esa función a `ValidationResult<Omit<AIRecommendation, 'source'>>`.
5. En `src/renderer/components/Recommendations.tsx`, muestra un aviso visible
   cuando `recommendation.source === 'local'`: un banner amarillo con el texto
   "La IA no respondio. Esta es una recomendacion local de respaldo generada
   por OBSREC." (usa las clases de advertencia ya existentes en
   `AudioConfiguration.tsx:226` como patrón: `border-yellow-500/30
   bg-yellow-500/10 ... text-yellow-200`).

**Verificar**: `pnpm run typecheck` → exit 0 (este paso rompe el typecheck hasta tocar todos los puntos; el orden 1→5 minimiza el tiempo en rojo)

### Paso 4: Dejar de perder las advertencias de audio en la importación

En `src/main/obs-manager.ts`, reemplaza el bloque citado en "Estado actual"
por una versión que no huela strings: haz que `configureAudio` devuelva
también sus advertencias (`{ success, message, snapshot, warnings: string[] }`)
y en `configure()`:

```ts
if (config.audio) {
  const audioResult = await this.configureAudio(config.audio);
  if (!audioResult.success) {
    warnings.push(audioResult.message);
  } else if (audioResult.warnings.length > 0) {
    warnings.push(...audioResult.warnings);
  }
}
```

Actualiza el tipo de retorno de `configureAudio` y la declaración de
`window.electronAPI.obs.configureAudio` en
`src/renderer/hooks/useElectronAPI.ts:138` para incluir `warnings: string[]`.

**Verificar**: `pnpm run typecheck && pnpm run lint` → exit 0; `grep -n "includes('warnings')" src/main/obs-manager.ts` → sin resultados

### Paso 5: Tests y humo

**Verificar**: `pnpm test` → todos pasan (si el plan 003 corrió, actualiza el
test de `getLocalRecommendation` para que espere `source: 'local'` y el
`reasoning` en español). Si el entorno lo permite, `pnpm run dev` y revisar:
textos en español, banner de error anunciable, recomendación local marcada
(prueba quitando `GROQ_API_KEY` del entorno).

## Plan de pruebas

- Actualizar `src/shared/localRecommendation.test.ts` (si existe por el plan
  003): asertar `source: 'local'` y el nuevo `reasoning`.
- Nuevo caso en `validation.test.ts`: `validateAIRecommendation` sigue
  aceptando una respuesta de IA **sin** campo `source`.
- El resto es UI sin framework de tests de componentes: cubierto por el humo
  manual del Paso 5.

## Criterios de terminado

- [ ] `grep -rniE "find best|select mode|diagnosis|successfully|disconnected from" src/renderer` → sin resultados
- [ ] `grep -n "source: 'local'" src/shared/localRecommendation.ts` → 1 resultado
- [ ] `grep -n "includes('warnings')" src/main/obs-manager.ts` → sin resultados
- [ ] `pnpm run typecheck`, `pnpm run lint` exit 0
- [ ] `pnpm test` exit 0 (si existe)
- [ ] Ningún archivo fuera del alcance modificado (`git status`)
- [ ] Fila de estado actualizada en `plans/README.md`

## Condiciones de STOP

Detente y reporta si:

- `Recommendations.tsx` o los componentes no inventariados tienen una
  estructura muy distinta a la esperada (p. ej. ya consumen un campo `source`
  o ya están traducidos — deriva).
- El cambio de `source` obliga a tocar más de los 6 archivos listados en
  alcance.
- Tras traducir, algún flujo compara textos de mensajes con `includes(...)`
  además del caso del Paso 4 (busca `message.includes` en `src/` y repórtalo
  antes de traducir ese mensaje).

## Notas de mantenimiento

- Regla para el futuro: **ningún** código debe tomar decisiones comparando
  substrings de mensajes de usuario; usar campos estructurados
  (`warnings: string[]`, `source`).
- Revisor: revisar el banner de recomendación local — es la pieza de
  honestidad del producto ("transparencia" es la promesa del README).
- Diferido: i18n multi-idioma; reemplazo de `window.confirm` (plan 007).
