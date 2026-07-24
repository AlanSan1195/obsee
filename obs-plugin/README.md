# Obsee Advanced Output Control

Complemento nativo de OBS que cubre la parte que `obs-websocket` no expone:
los ajustes internos de los encoders de **Salida > Avanzado > Emisión** y
**Grabación**.

## Qué hace

- Lee `streamEncoder.json` y `recordEncoder.json` del perfil activo.
- Combina esos valores con los predeterminados reales del encoder. Esto permite
  detectar opciones que OBS muestra en la interfaz aunque no estén escritas en
  el JSON.
- Expone a Obsee los vendors `GetAdvancedOutputConfig` y
  `ApplyAdvancedOutputConfig`.
- Aplica bitrate, control de tasa, calidad, límite de bitrate, ventana máxima,
  intervalo de fotogramas clave, perfil, B-frames y AQ espacial.
- Escribe con `obs_data_save_json_safe`; OBS conserva una copia
  `.obsee-backup` del archivo anterior.
- Rechaza cambios mientras una transmisión o grabación está activa.
- Nunca lee ni devuelve claves de transmisión, rutas de grabación, escenas o
  credenciales.

## Compilar en macOS

Requisitos:

- OBS Studio 32.x.
- Xcode o Command Line Tools.
- CMake 3.28 o posterior.
- Los paquetes de desarrollo de `libobs` y `obs-frontend-api`. La forma
  recomendada es usar este directorio como el código fuente del complemento
  dentro del [template oficial de plugins de OBS](https://github.com/obsproject/obs-plugintemplate),
  que descarga las dependencias compatibles.

Si los paquetes CMake de OBS ya están disponibles:

```bash
cmake -S obs-plugin -B obs-plugin/build \
  -DCMAKE_BUILD_TYPE=RelWithDebInfo \
  -DCMAKE_PREFIX_PATH="/ruta/a/obs-deps"
cmake --build obs-plugin/build --config RelWithDebInfo
```

El resultado esperado es `obsee-advanced-control.plugin`.

## Instalar

Con OBS cerrado, copia el bundle compilado a:

```text
~/Library/Application Support/obs-studio/plugins/obsee-advanced-control.plugin
```

Luego abre OBS y reinicia la conexión en Obsee. En la comparación debe aparecer
`Complemento avanzado activo`, junto con los valores reales del stream y la
grabación.

## Contrato WebSocket

Lectura:

```json
{
  "vendorName": "obsee",
  "requestType": "GetAdvancedOutputConfig",
  "requestData": {}
}
```

Aplicación:

```json
{
  "vendorName": "obsee",
  "requestType": "ApplyAdvancedOutputConfig",
  "requestData": {
    "stream": {
      "rate_control": "CBR",
      "bitrate": 9000,
      "keyint_sec": 2,
      "profile": "high",
      "bframes": true,
      "spatial_aq_mode": 1
    },
    "recording": {
      "rate_control": "CBR",
      "bitrate": 12000,
      "quality": 76,
      "keyint_sec": 2,
      "bframes": true,
      "spatial_aq_mode": 1
    }
  }
}
```

`spatial_aq_mode` usa los valores de Apple VideoToolbox: `1` automático, `2`
desactivado y `3` activado.

