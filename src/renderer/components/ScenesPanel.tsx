import React, { useEffect, useState } from 'react';
import { useAppStore } from '../store';
import { useElectronAPI } from '../hooks/useElectronAPI';
import { IconClapperboard, IconRefresh, Section } from './ui';
import { SceneList } from './SceneList';
import { SourceList } from './SourceList';
import { AddSourceWizard } from './AddSourceWizard';

const secondaryButton =
  'inline-flex items-center gap-1.5 rounded-none border border-border px-3 py-2 text-xs font-semibold text-text transition-colors hover:border-primary/40 hover:bg-white/[0.04] disabled:cursor-not-allowed disabled:opacity-50';

export function ScenesPanel() {
  const obsConnected = useAppStore((state) => state.obsConnected);
  const scenes = useAppStore((state) => state.scenes);
  const selectedSceneName = useAppStore((state) => state.selectedSceneName);
  const { refreshScenes, loadSourceKinds, loadSceneSources } = useElectronAPI();

  const [autoLoaded, setAutoLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);

  // Carga inicial de escenas y tipos de fuente al conectarse.
  useEffect(() => {
    if (!obsConnected || autoLoaded) return;
    setAutoLoaded(true);
    void refreshScenes();
    void loadSourceKinds();
  }, [obsConnected, autoLoaded, refreshScenes, loadSourceKinds]);

  // Carga las fuentes cuando cambia la escena seleccionada.
  useEffect(() => {
    if (obsConnected && selectedSceneName) {
      void loadSceneSources(selectedSceneName);
    }
  }, [obsConnected, selectedSceneName, loadSceneSources]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshScenes();
      await loadSourceKinds();
      if (selectedSceneName) {
        await loadSceneSources(selectedSceneName);
      }
    } finally {
      setRefreshing(false);
    }
  };

  const action = obsConnected ? (
    <button type="button" className={secondaryButton} onClick={handleRefresh} disabled={refreshing}>
      <IconRefresh className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
      actualizar
    </button>
  ) : undefined;

  return (
    <Section
      title="escenas y fuentes"
      icon={<IconClapperboard className="h-5 w-5" />}
      subtitle="arma tu primera escena sin aprender obs"
      action={action}
    >
      {!obsConnected ? (
        <p className="text-sm text-text-muted">Conectate a OBS primero para administrar escenas y fuentes.</p>
      ) : (
        <>
          <div className="grid gap-5 lg:grid-cols-2">
            <div>
              <h4 className="mb-2 text-xs lowercase tracking-terminal text-text-faint">escenas</h4>
              <SceneList />
            </div>
            <div>
              <h4 className="mb-2 text-xs lowercase tracking-terminal text-text-faint">fuentes</h4>
              <SourceList
                sceneName={scenes.length > 0 ? selectedSceneName : null}
                onAddSource={() => setWizardOpen(true)}
              />
            </div>
          </div>

          {selectedSceneName && (
            <AddSourceWizard
              open={wizardOpen}
              sceneName={selectedSceneName}
              onClose={() => setWizardOpen(false)}
              onCreated={() => {
                if (selectedSceneName) {
                  void loadSceneSources(selectedSceneName);
                }
              }}
            />
          )}
        </>
      )}
    </Section>
  );
}
