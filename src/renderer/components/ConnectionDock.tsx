import { useState } from 'react';
import { useAppStore } from '../store';
import { useAppAPI } from '../hooks/useAppAPI';
import { IconCheck, IconPlug, Spinner } from './ui';

export function ConnectionDock() {
  const [connecting, setConnecting] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const {
    obsConnected,
    obsConnectionSettings,
    obsMessage,
    setObsConnectionSettings,
    setError,
  } = useAppStore();
  const { connectToOBS } = useAppAPI();

  if (obsConnected) {
    return (
      <div className="connection-dock connection-dock--connected">
        <span className="connection-dock__pulse" aria-hidden="true" />
        <div>
          <strong>OBS conectado</strong>
          <span>Leeremos el estado actual antes de aplicar cambios.</span>
        </div>
        <IconCheck className="h-4 w-4" />
      </div>
    );
  }

  const connect = async () => {
    setConnecting(true);
    setError(null);
    try {
      await connectToOBS(obsConnectionSettings);
    } catch {
      // useAppAPI ya publica el mensaje de conexion en el estado global.
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div className="connection-dock">
      <div className="connection-dock__main">
        <IconPlug className="h-4 w-4" />
        <div>
          <strong>Conecta OBS para comparar y aplicar</strong>
          <span>{obsMessage || 'La recomendación puede generarse sin modificar nada.'}</span>
        </div>
        <button type="button" onClick={() => setExpanded((value) => !value)}>
          {expanded ? 'Ocultar' : 'Conectar'}
        </button>
      </div>
      {expanded && (
        <div className="connection-dock__form">
          <label>
            <span>Contraseña WebSocket</span>
            <input
              type="password"
              value={obsConnectionSettings.password}
              onChange={(event) => setObsConnectionSettings({ password: event.target.value })}
              placeholder="Opcional"
            />
          </label>
          <label>
            <span>Host</span>
            <input
              value={obsConnectionSettings.host}
              onChange={(event) => setObsConnectionSettings({ host: event.target.value })}
            />
          </label>
          <label className="connection-dock__port">
            <span>Puerto</span>
            <input
              type="number"
              min={1}
              max={65535}
              value={obsConnectionSettings.port}
              onChange={(event) => setObsConnectionSettings({ port: Number(event.target.value) })}
            />
          </label>
          <button type="button" disabled={connecting} onClick={() => void connect()} className="calm-button calm-button--primary">
            {connecting ? <Spinner className="h-4 w-4 border-background/70 border-t-transparent" /> : <IconPlug className="h-4 w-4" />}
            {connecting ? 'Conectando…' : 'Conectar'}
          </button>
        </div>
      )}
    </div>
  );
}
