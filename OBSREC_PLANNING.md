# OBSREC Planning

## Objetivo del Proyecto

OBSREC busca ser una aplicacion de escritorio que analiza el hardware del usuario, recomienda una configuracion optima para OBS y permite aplicarla directamente mediante OBS WebSocket.

La intencion principal es ahorrar tiempo a streamers o creadores que no saben que resolucion, FPS, encoder, bitrate o formato de grabacion usar segun su PC y plataforma.

## Estado Actual

El proyecto ya tiene una base inicial sana:

- App Electron con proceso main, preload y renderer separados.
- Frontend en React + Vite.
- Estado global con Zustand.
- Integracion inicial con OBS WebSocket.
- Analisis local de hardware con `systeminformation`.
- Capa inicial de IA usando Groq.
- Build de main y renderer funcionando.
- Tipos compartidos centralizados en `src/shared/types.ts`.
- Validacion basica para IPC y respuestas de IA en `src/shared/validation.ts`.
- Lint y typecheck funcionando como scripts del proyecto.
- Conexion OBS con host, puerto y password configurables.
- Recomendaciones editables antes de importarlas.
- Fallback local si la IA falla o devuelve una respuesta invalida.

Todavia esta en fase de prototipo. La interfaz ya comunica bien la experiencia esperada, pero el backend aun no aplica toda la configuracion que la UI muestra.

## Diagnostico

La direccion general es correcta, pero antes de crecer conviene ordenar varias areas:

- La configuracion enviada a OBS esta incompleta.
- Hay tipos duplicados entre main, renderer y shared.
- Falta validar inputs IPC antes de usarlos en el proceso main.
- Hay artefactos generados mezclados con el codigo fuente.
- El script de lint existe, pero ESLint no esta instalado.
- La conexion a OBS esta hardcodeada en `localhost:4455` sin password configurable.
- La recomendacion de IA depende de que el modelo devuelva JSON valido.

## Prioridades

### 1. Limpiar estructura del proyecto

- Inicializar git si todavia no existe.
- Mantener en fuente solo archivos editables.
- Evitar versionar `dist/`, `release/`, `node_modules/` y builds dentro de `src/`.
- Revisar carpetas residuales como `src/dist`, `dist/main 2` y `dist/renderer 2`.
- Confirmar que `.gitignore` cubre todos los artefactos generados.

### 2. Arreglar tooling basico

- [x] Instalar y configurar ESLint.
- [x] Agregar un script de typecheck explicito.
- Mantener scripts separados para:
  - [x] desarrollo
  - [x] build main
  - [x] build renderer
  - [x] build completo
  - [x] lint
  - [x] typecheck

### 3. Centralizar tipos compartidos

- [x] Usar `src/shared/types.ts` como fuente unica de tipos.
- [x] Reutilizar `SystemInfo`, `OBSConfig` y `AIRecommendation` en main y renderer.
- [x] Evitar duplicar interfaces en `store.ts`, `index.ts` y `useElectronAPI.ts`.

### 4. Validar contratos IPC

- [x] Validar `obs:configure` antes de llamar a OBS.
- [x] Validar `ai:get-recommendation` antes de construir prompts.
- [x] Rechazar configuraciones incompletas o invalidas con mensajes claros.
- [x] Evitar que el proceso main confie directamente en objetos enviados desde renderer.

### 5. Completar configuracion real de OBS

Actualmente `OBSManager.configure()` recibe varios valores, pero solo aplica parte de ellos.

Pendiente aplicar correctamente:

- [x] Resolucion base y de salida.
- [x] FPS.
- [x] Encoder de streaming para OBS Simple Output cuando es mapeable.
- [x] Bitrate de streaming.
- [x] Audio bitrate.
- [x] Formato de grabacion.
- [x] Calidad de grabacion.
- Modo stream, record o stream + record.

Tambien conviene revisar los nombres exactos de settings que espera OBS WebSocket para cada plataforma y version.

### 6. Hacer configurable la conexion a OBS

- [x] Permitir configurar host.
- [x] Permitir configurar puerto.
- [x] Permitir configurar password.
- Guardar preferencias locales de forma segura.
- [x] Mostrar errores claros si OBS no esta abierto o WebSocket no esta activo.

### 7. Endurecer la capa de IA

- [x] Manejar respuestas no JSON.
- [x] Crear fallback local cuando la IA falle.
- [x] Ajustar recomendaciones por plataforma.
- [x] Distinguir entre Twitch y YouTube en bitrate y restricciones practicas.
- [x] No depender completamente del modelo para decisiones basicas que pueden calcularse localmente.

### 8. Mejorar UX del flujo principal

- Mostrar progreso por pasos:
  - analizando PC
  - generando recomendacion
  - conectando con OBS
  - aplicando configuracion
- [x] Mostrar que valores se van a cambiar antes de aplicarlos.
- [x] Permitir editar manualmente la recomendacion antes de importarla.
- Dar confirmacion final con resumen de cambios aplicados.

### 9. Agregar pruebas o checks minimos

- Tests para funciones puras de recomendacion/fallback.
- Tests para validadores de configuracion.
- Typecheck en CI o como script local.
- Verificacion manual del flujo con OBS abierto.

## Siguiente Paso Recomendado

El siguiente paso mas valioso es probar el flujo contra OBS abierto y revisar que los parametros de perfil usados por `SetProfileParameter` coincidan con la version de OBS instalada.

Orden sugerido:

1. Probar conexion real con OBS WebSocket.
2. Verificar que se apliquen FPS, resolucion, bitrate y formato.
3. Agregar UI para host, puerto y password de OBS.
4. Permitir editar manualmente la recomendacion antes de aplicarla.
5. Agregar fallback local si la IA falla.
