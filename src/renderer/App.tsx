import { useEffect, useMemo, useState } from 'react';
import { parseGoal, type ParsedGoal, type ParsedHardware } from '../shared/goalParser';
import type { OBSMode, OBSPlatform } from '../shared/types';
import { ConnectionDock } from './components/ConnectionDock';
import { GoalComposer } from './components/GoalComposer';
import { HardwareConfirmation } from './components/HardwareConfirmation';
import { RecommendationReview } from './components/RecommendationReview';
import { IconAlert, IconCheck, IconCpu, IconX, Spinner } from './components/ui';
import { useAppAPI } from './hooks/useAppAPI';
import { appAPI } from './lib/app-api';
import {
  detectHardwareHints,
  loadHardwareOverrides,
  saveHardwareOverrides,
} from './lib/system-info';
import { useAppStore } from './store';

type IntakeState = 'writing' | 'clarifying' | 'hardware' | 'analyzing';

function mergeHardware(parsed: ParsedHardware): ParsedHardware {
  const stored = loadHardwareOverrides();
  return {
    cpuModel: parsed.cpuModel ?? stored.cpuModel,
    cpuCores: parsed.cpuCores ?? stored.cpuCores,
    ramGb: parsed.ramGb ?? stored.ramGb,
  };
}

function hasCompleteHardware(hardware: ParsedHardware): hardware is Required<ParsedHardware> {
  return Boolean(
    hardware.cpuModel
    && hardware.cpuCores
    && hardware.cpuCores > 0
    && hardware.ramGb
    && hardware.ramGb > 0,
  );
}

function clarificationFor(mode: OBSMode | null, platform: OBSPlatform | null): string | null {
  if (!mode) {
    return '¿Quieres transmitir, grabar o hacer ambas cosas? Escríbelo como lo dirías normalmente.';
  }
  if (mode !== 'record_only' && !platform) {
    return '¿Dónde quieres transmitir: YouTube o Twitch?';
  }
  return null;
}

export default function App() {
  const hints = useMemo(() => detectHardwareHints(), []);
  const [input, setInput] = useState('');
  const [conversationText, setConversationText] = useState('');
  const [intakeState, setIntakeState] = useState<IntakeState>('writing');
  const [assistantQuestion, setAssistantQuestion] = useState<string | null>(null);
  const [pendingGoal, setPendingGoal] = useState<ParsedGoal | null>(null);
  const [activeGoal, setActiveGoal] = useState<ParsedGoal | null>(null);
  const {
    error,
    mode: storedMode,
    platform: storedPlatform,
    obsConnected,
    recommendation,
    setAnalysisTarget,
    setConsoleModel,
    setConsoleProfile,
    setError,
    setIsAnalyzing,
    setMode,
    setObsAudioSnapshot,
    setObsConnected,
    setObsMessage,
    setObsSettingsSnapshot,
    setPlatform,
    setRecommendation,
    setSelectedCaptureCard,
    setSelectedMonitor,
  } = useAppStore();
  const {
    getAIRecommendation,
    getCaptureCapabilities,
    getPeripherals,
    getSystemInfo,
    profileConsole,
  } = useAppAPI();

  useEffect(() => appAPI.obs.onConnectionChanged((status) => {
    setObsConnected(status.connected);
    setObsMessage(status.message);
    if (!status.connected) {
      setObsSettingsSnapshot(null);
      setObsAudioSnapshot(null);
    }
  }), [setObsAudioSnapshot, setObsConnected, setObsMessage, setObsSettingsSnapshot]);

  const runAnalysis = async (goal: ParsedGoal) => {
    const mode = goal.mode;
    const platform = goal.platform ?? (mode === 'record_only' ? 'youtube' : null);
    if (!mode || !platform) return;

    setIntakeState('analyzing');
    setAssistantQuestion(null);
    setError(null);
    setMode(mode);
    setPlatform(platform);
    setRecommendation(null);
    setConsoleProfile(null);
    setAnalysisTarget(goal.consoleModel ? 'console' : 'pc');
    setConsoleModel(goal.consoleModel);
    setIsAnalyzing(true);

    try {
      const systemInfo = await getSystemInfo();
      const obsSettingsSnapshot = useAppStore.getState().obsSettingsSnapshot;

      if (goal.consoleModel) {
        const peripherals = await getPeripherals();
        const captureCard = goal.captureCard ?? peripherals?.captureDevices[0]?.name;
        const monitor = goal.monitor ?? peripherals?.displays[0]?.model;
        setSelectedCaptureCard(captureCard ?? '');
        setSelectedMonitor(monitor ?? '');

        const captureCapabilities = obsConnected && captureCard
          ? await getCaptureCapabilities(captureCard)
          : null;
        const matchedDisplay = peripherals?.displays.find((display) => display.model === monitor);

        const profile = await profileConsole({
          console: goal.consoleModel,
          captureCard,
          monitor,
          monitorRefreshRate: matchedDisplay?.refreshRate || undefined,
          captureMaxResolution: captureCapabilities?.maxResolution,
          captureMaxFps: captureCapabilities?.maxFps,
          platform,
          mode,
          systemInfo,
          goal: goal.preferences,
        });
        if (!profile) {
          throw new Error('No se pudo completar el análisis de la consola.');
        }
      } else {
        await getAIRecommendation({
          systemInfo,
          mode,
          platform,
          goal: goal.preferences,
          currentSettings: obsSettingsSnapshot
            ? {
              resolution: obsSettingsSnapshot.streamResolution ?? obsSettingsSnapshot.outputResolution,
              fps: obsSettingsSnapshot.fps,
              encoder: obsSettingsSnapshot.encoder,
              bitrate: obsSettingsSnapshot.bitrate,
              recordingQuality: obsSettingsSnapshot.recordingQuality,
              hasStreamService: obsSettingsSnapshot.streamServer.trim().length > 0,
            }
            : undefined,
        });
      }

      setActiveGoal(goal);
    } catch (analysisError) {
      console.error('Goal analysis failed:', analysisError);
      setIntakeState('clarifying');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const continueWithGoal = (parsed: ParsedGoal) => {
    const mode = parsed.mode ?? storedMode;
    const platform = parsed.platform ?? storedPlatform;
    const resolved: ParsedGoal = {
      ...parsed,
      mode,
      platform: mode === 'record_only' ? (platform ?? 'youtube') : platform,
      hardware: mergeHardware(parsed.hardware),
    };
    const question = clarificationFor(resolved.mode, resolved.platform);

    if (question) {
      setPendingGoal(resolved);
      setAssistantQuestion(question);
      setIntakeState('clarifying');
      return;
    }

    if (!hasCompleteHardware(resolved.hardware)) {
      setPendingGoal(resolved);
      setAssistantQuestion(null);
      setIntakeState('hardware');
      return;
    }

    saveHardwareOverrides(resolved.hardware);
    setPendingGoal(null);
    void runAnalysis(resolved);
  };

  const handleSubmit = () => {
    const message = input.trim();
    if (message.length < 8 || intakeState === 'analyzing') return;
    const combined = conversationText ? `${conversationText}\n${message}` : message;
    setConversationText(combined);
    setInput('');

    const next = parseGoal(combined);
    if (pendingGoal) {
      next.hardware = { ...pendingGoal.hardware, ...next.hardware };
      next.preferences = {
        ...pendingGoal.preferences,
        ...next.preferences,
        description: combined,
      };
      next.consoleModel = next.consoleModel ?? pendingGoal.consoleModel;
      next.captureCard = next.captureCard ?? pendingGoal.captureCard;
      next.monitor = next.monitor ?? pendingGoal.monitor;
    }
    continueWithGoal(next);
  };

  const confirmHardware = (hardware: Required<ParsedHardware>) => {
    if (!pendingGoal) return;
    saveHardwareOverrides(hardware);
    const completed = { ...pendingGoal, hardware };
    setPendingGoal(null);
    void runAnalysis(completed);
  };

  const startOver = () => {
    setRecommendation(null);
    setConsoleProfile(null);
    setActiveGoal(null);
    setPendingGoal(null);
    setConversationText('');
    setAssistantQuestion(null);
    setInput('');
    setIntakeState('writing');
    setError(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="obsee-app">
      <div className="app-backdrop" aria-hidden="true" />
      <header className="quiet-header">
        <button type="button" className="brand" onClick={startOver} aria-label="Ir al inicio de Obsee">
          <span><b>obs</b>ee</span>
          <small>config copilot</small>
        </button>
        <div className="quiet-header__status">
          <span className={obsConnected ? 'is-online' : ''}>
            <i aria-hidden="true" />
            {obsConnected ? 'OBS conectado' : 'OBS sin conectar'}
          </span>
          <span className="quiet-header__hardware">
            <IconCpu className="h-3.5 w-3.5" />
            {hints.gpu.model}
          </span>
        </div>
      </header>

      {error && (
        <div className="floating-error" role="alert">
          <IconAlert className="h-4 w-4" />
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} aria-label="Cerrar error">
            <IconX className="h-4 w-4" />
          </button>
        </div>
      )}

      {recommendation && activeGoal ? (
        <RecommendationReview goal={activeGoal} onNewGoal={startOver} />
      ) : (
        <main className="intake-shell">
          <section className="intake-hero">
            <div className="intake-hero__signal" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <p className="intake-hero__eyebrow">
              Tu especialista de configuración OBS
            </p>
            <h1>¿Qué quieres conseguir<br />con tu contenido?</h1>
            <p className="intake-hero__subtitle">
              Cuéntale a Obsee tu objetivo. Detectará el contexto, preparará el
              mejor match para tu equipo y te explicará cada decisión.
            </p>
          </section>

          <div className="conversation-stack">
            {conversationText && (
              <div className="user-message">
                <span>Tú</span>
                <p>{conversationText}</p>
              </div>
            )}

            {assistantQuestion && (
              <section className="conversation-card">
                <div className="conversation-card__avatar">
                  <span>o</span>
                </div>
                <div>
                  <span className="conversation-card__eyebrow">Obsee necesita un dato</span>
                  <h2>{assistantQuestion}</h2>
                </div>
              </section>
            )}

            {intakeState === 'hardware' && pendingGoal && (
              <HardwareConfirmation
                initial={pendingGoal.hardware}
                onConfirm={confirmHardware}
              />
            )}

            {intakeState === 'analyzing' && (
              <section className="conversation-card conversation-card--analyzing" aria-live="polite">
                <Spinner className="h-6 w-6" />
                <div>
                  <span className="conversation-card__eyebrow">Analizando en paralelo</span>
                  <h2>Haciendo match entre tu objetivo, hardware y OBS…</h2>
                  <div className="analysis-checks">
                    <span><IconCheck className="h-3.5 w-3.5" /> Intención entendida</span>
                    <span><span className="analysis-checks__pulse" /> Calculando salidas</span>
                    <span>Preparando explicación</span>
                  </div>
                </div>
              </section>
            )}

            {intakeState !== 'hardware' && (
              <GoalComposer
                value={input}
                onChange={setInput}
                onSubmit={handleSubmit}
                busy={intakeState === 'analyzing'}
                compact={Boolean(conversationText)}
              />
            )}

            {intakeState === 'writing' && (
              <div className="detected-context">
                <span className="detected-context__icon"><IconCpu className="h-4 w-4" /></span>
                <div>
                  <strong>Contexto detectado</strong>
                  <span>
                    {hints.gpu.model} · {hints.os.distro}
                    {hints.logicalProcessors ? ` · ${hints.logicalProcessors} procesadores lógicos` : ''}
                  </span>
                </div>
                <IconCheck className="h-4 w-4" />
              </div>
            )}

            <ConnectionDock />

            <p className="privacy-note">
              Tu solicitud y datos técnicos se usan únicamente para calcular la
              recomendación. Obsee nunca recibe tus claves de transmisión.
            </p>
          </div>
        </main>
      )}
    </div>
  );
}
