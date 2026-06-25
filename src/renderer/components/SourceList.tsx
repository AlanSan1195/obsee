import React, { useState } from 'react';
import { useAppStore } from '../store';
import { useElectronAPI } from '../hooks/useElectronAPI';
import type { SceneItemSummary, SourceKindFriendly } from '../../shared/types';
import { ConfirmDialog } from './ConfirmDialog';
import { IconClapperboard, IconMonitor, IconTv, IconVideo, IconX } from './ui';

const primaryButton =
  'inline-flex items-center justify-center gap-1.5 rounded-none bg-primary px-4 py-2.5 text-sm font-bold lowercase tracking-terminal text-background shadow-[0_0_26px_-8px_rgba(94,255,159,0.6)] transition-all hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50';

function iconForKind(kind: SourceKindFriendly | undefined) {
  switch (kind) {
    case 'display':
      return <IconMonitor className="h-4 w-4" />;
    case 'window':
      return <IconTv className="h-4 w-4" />;
    case 'game_console':
      return <IconClapperboard className="h-4 w-4" />;
    default:
      return <IconVideo className="h-4 w-4" />;
  }
}

type SourceListProps = {
  sceneName: string | null;
  onAddSource: () => void;
};

export function SourceList({ sceneName, onAddSource }: SourceListProps) {
  const sceneSources = useAppStore((state) => state.sceneSources);
  const { removeSource, setSourceEnabled } = useElectronAPI();
  const [pendingDelete, setPendingDelete] = useState<SceneItemSummary | null>(null);

  if (!sceneName) {
    return <p className="text-xs text-text-muted">Selecciona o crea una escena para agregar fuentes.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs lowercase tracking-terminal text-text-faint">fuentes de {sceneName}</span>
      </div>

      {sceneSources.length === 0 ? (
        <p className="text-xs text-text-muted">Esta escena no tiene fuentes todavia.</p>
      ) : (
        <ul className="space-y-1.5">
          {sceneSources.map((item) => (
            <li
              key={item.sceneItemId}
              className="flex items-center gap-2 border border-border px-3 py-2"
            >
              <span className="shrink-0 text-primary">{iconForKind(item.friendlyKind)}</span>
              <span className={`min-w-0 flex-1 truncate text-sm ${item.enabled ? 'text-text' : 'text-text-faint line-through'}`}>
                {item.sourceName}
              </span>
              <button
                type="button"
                onClick={() => setSourceEnabled(sceneName, item.sceneItemId, !item.enabled)}
                className="shrink-0 text-[0.65rem] lowercase tracking-terminal text-text-muted transition-colors hover:text-primary"
              >
                {item.enabled ? 'ocultar' : 'mostrar'}
              </button>
              <button
                type="button"
                onClick={() => setPendingDelete(item)}
                aria-label={`Eliminar fuente ${item.sourceName}`}
                className="shrink-0 p-1 text-text-faint transition-colors hover:text-red-400"
              >
                <IconX className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <button type="button" className={`${primaryButton} w-full`} onClick={onAddSource}>
        + Agregar fuente
      </button>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Eliminar fuente"
        confirmLabel="Eliminar"
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) {
            void removeSource(pendingDelete.sourceName, sceneName);
          }
          setPendingDelete(null);
        }}
      >
        <p>
          Se eliminara la fuente <span className="text-text">{pendingDelete?.sourceName}</span> de OBS.
        </p>
      </ConfirmDialog>
    </div>
  );
}
