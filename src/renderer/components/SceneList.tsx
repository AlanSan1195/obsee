import React, { useState } from 'react';
import { useAppStore } from '../store';
import { useAppAPI } from '../hooks/useAppAPI';
import { ConfirmDialog } from './ConfirmDialog';
import { IconX } from './ui';

const secondaryButton =
  'inline-flex items-center justify-center gap-1.5 rounded-none border border-border px-3 py-2 text-xs font-semibold text-text transition-colors hover:border-primary/40 hover:bg-white/[0.04] disabled:cursor-not-allowed disabled:opacity-50';

export function SceneList() {
  const scenes = useAppStore((state) => state.scenes);
  const currentSceneName = useAppStore((state) => state.currentSceneName);
  const selectedSceneName = useAppStore((state) => state.selectedSceneName);
  const { createScene, selectScene, removeScene } = useAppAPI();

  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      const result = await createScene(name);
      if (result.success) {
        setNewName('');
      }
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              void handleCreate();
            }
          }}
          placeholder="Nueva escena…"
          className="min-w-0 flex-1 rounded-none border border-border bg-background px-3 py-2 text-sm text-text focus:border-primary focus:outline-none"
        />
        <button type="button" className={secondaryButton} onClick={handleCreate} disabled={creating || !newName.trim()}>
          Crear
        </button>
      </div>

      {scenes.length === 0 ? (
        <p className="text-xs text-text-muted">Aun no hay escenas. Crea la primera para empezar.</p>
      ) : (
        <ul className="space-y-1.5">
          {scenes.map((scene) => {
            const isSelected = scene.sceneName === selectedSceneName;
            const isCurrent = scene.sceneName === currentSceneName;
            return (
              <li key={scene.sceneUuid ?? scene.sceneName}>
                <div
                  className={`flex items-center gap-2 border px-3 py-2 transition-colors ${
                    isSelected ? 'border-primary/50 bg-primary/[0.06]' : 'border-border hover:border-primary/30'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => selectScene(scene.sceneName)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <span
                      className={`h-2 w-2 shrink-0 ${isCurrent ? 'bg-primary text-glow' : 'bg-text-muted/50'}`}
                      aria-hidden="true"
                    />
                    <span className={`truncate text-sm ${isSelected ? 'text-primary' : 'text-text'}`}>
                      {scene.sceneName}
                    </span>
                    {isCurrent && (
                      <span className="shrink-0 text-[0.6rem] lowercase tracking-terminal text-primary">en vivo</span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingDelete(scene.sceneName)}
                    aria-label={`Eliminar escena ${scene.sceneName}`}
                    className="shrink-0 p-1 text-text-faint transition-colors hover:text-red-400"
                  >
                    <IconX className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Eliminar escena"
        confirmLabel="Eliminar"
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) {
            void removeScene(pendingDelete);
          }
          setPendingDelete(null);
        }}
      >
        <p>
          Se eliminara la escena <span className="text-text">{pendingDelete}</span> y sus fuentes en OBS. Esta accion no se
          puede deshacer.
        </p>
      </ConfirmDialog>
    </div>
  );
}
