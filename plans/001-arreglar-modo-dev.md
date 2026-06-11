# Plan 001: Hacer que `pnpm run dev` cargue el servidor de Vite (modo desarrollo real)

> **Instrucciones para el ejecutor**: Sigue este plan paso a paso. Ejecuta cada
> comando de verificación y confirma el resultado esperado antes de avanzar.
> Si ocurre algo de la sección "Condiciones de STOP", detente y reporta — no
> improvises. Al terminar, actualiza la fila de este plan en `plans/README.md`.
>
> **Chequeo de deriva (ejecutar primero)**: `git diff --stat 86bec05..HEAD -- package.json src/main/index.ts`
> Si algún archivo en alcance cambió desde que se escribió este plan, compara
> los extractos de "Estado actual" contra el código vivo antes de continuar;
> si no coinciden, trátalo como condición de STOP.

## Estado

- **Prioridad**: P1
- **Esfuerzo**: S
- **Riesgo**: LOW
- **Depende de**: ninguno
- **Categoría**: bug
- **Planeado en**: commit `86bec05`, 2026-06-10

## Por qué importa

El script de desarrollo nunca activa el modo desarrollo. `src/main/index.ts`
decide cargar el servidor de Vite (`http://localhost:5173`) solo si
`NODE_ENV === 'development'` o si el proceso recibe el flag `--dev`, pero el
script `dev:electron` ejecuta `electron .` sin ninguna de las dos cosas. El
resultado: durante `pnpm run dev`, Electron carga el build estático viejo de
`dist/renderer/index.html` (o una pantalla en blanco si no existe), se pierde
el hot-reload de Vite, y los cambios del renderer "no aparecen" hasta que se
reconstruye. El `wait-on tcp:5173` del script espera a Vite para luego no
usarlo.

## Estado actual

Archivos relevantes:

- `package.json` — scripts de desarrollo (líneas 7-9)
- `src/main/index.ts` — detección de modo dev (líneas 28-33)

Extracto de `package.json:7-9`:

```json
"dev": "concurrently \"pnpm run dev:vite\" \"pnpm run dev:electron\"",
"dev:vite": "vite",
"dev:electron": "pnpm run build:main && wait-on tcp:5173 && electron .",
```

Extracto de `src/main/index.ts:28-33`:

```ts
if (process.env.NODE_ENV === 'development' || process.argv.includes('--dev')) {
  mainWindow.loadURL('http://localhost:5173');
  mainWindow.webContents.openDevTools();
} else {
  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
}
```

Convención del repo: los scripts usan pnpm y comandos simples sin
dependencias extra (no hay `cross-env` instalado — no lo agregues).

## Comandos que necesitarás

| Propósito  | Comando               | Esperado en éxito      |
|------------|-----------------------|------------------------|
| Instalar   | `pnpm install`        | exit 0                 |
| Typecheck  | `pnpm run typecheck`  | exit 0, sin errores    |
| Lint       | `pnpm run lint`       | exit 0                 |
| Dev        | `pnpm run dev`        | ventana carga Vite     |

## Alcance

**En alcance** (los únicos archivos que debes modificar):
- `package.json` (solo la línea del script `dev:electron`)
- `README.md` (solo si menciona el comportamiento del modo dev — hoy no lo hace; probablemente sin cambios)

**Fuera de alcance** (NO tocar aunque parezca relacionado):
- `src/main/index.ts` — la condición existente con `--dev` es correcta una vez
  que el flag se pasa; no la reescribas ni introduzcas `app.isPackaged`.
- `vite.config.ts` — el puerto 5173 con `strictPort` ya está bien.

## Flujo de git

- Rama: `advisor/001-arreglar-modo-dev`
- Mensajes de commit en el estilo del repo (español, prefijo corto — ejemplo
  real del historial: `add: primera etapa de configuración de audio`).
- NO hagas push ni abras PR salvo que el operador lo indique.

## Pasos

### Paso 1: Pasar el flag `--dev` en el script de desarrollo

En `package.json`, cambia el script `dev:electron` de:

```json
"dev:electron": "pnpm run build:main && wait-on tcp:5173 && electron .",
```

a:

```json
"dev:electron": "pnpm run build:main && wait-on tcp:5173 && electron . --dev",
```

**Verificar**: `node -e "const s=require('./package.json').scripts['dev:electron']; if(!s.endsWith('electron . --dev')) process.exit(1)"` → exit 0

### Paso 2: Verificación estática

**Verificar**: `pnpm run typecheck && pnpm run lint` → ambos exit 0

### Paso 3: Verificación manual del flujo dev (si el entorno lo permite)

Ejecuta `pnpm run dev`. La ventana de Electron debe abrir la URL
`http://localhost:5173` (las DevTools se abren automáticamente — eso confirma
que entró a la rama dev del `if`). Cierra la app después de confirmar.

Si el entorno del ejecutor no puede abrir apps con interfaz gráfica, marca
este paso como "no verificado en este entorno" en tu reporte y apóyate en el
Paso 1.

**Verificar**: la ventana muestra la UI servida por Vite y las DevTools abiertas.

## Plan de pruebas

No se requieren tests automatizados nuevos: el cambio es una línea de script
de npm y la lógica condicional de `index.ts` no cambia. La verificación manual
del Paso 3 es la prueba.

## Criterios de terminado

Todos deben cumplirse:

- [ ] `package.json` contiene `electron . --dev` en `dev:electron`
- [ ] `pnpm run typecheck` exit 0
- [ ] `pnpm run lint` exit 0
- [ ] Ningún archivo fuera del alcance modificado (`git status`)
- [ ] Fila de estado actualizada en `plans/README.md`

## Condiciones de STOP

Detente y reporta si:

- El script `dev:electron` en `package.json` ya no coincide con el extracto
  (alguien lo cambió desde `86bec05`).
- La condición en `src/main/index.ts:28` ya no incluye `process.argv.includes('--dev')`.
- `pnpm run dev` con el flag sigue cargando el archivo estático (indicaría que
  la condición cambió o que `process.argv` no contiene el flag — reporta el
  valor real de `process.argv`).

## Notas de mantenimiento

- Si en el futuro se empaqueta la app y se quiere una detección más robusta,
  la mejora natural es `!app.isPackaged` en vez de variables de entorno, pero
  eso cambia el comportamiento de `electron .` a secas — decisión del
  mantenedor, fuera de este plan.
- Revisor: confirmar que las DevTools solo se abren en dev (ya es así: están
  dentro de la misma rama del `if`).
