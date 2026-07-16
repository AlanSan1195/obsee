import React from 'react';
import { useAppStore } from '../store';
import type { ConsoleComponentSpec } from '../../shared/types';
import { IconAlert, IconCheck, IconMonitor, IconTv, Section, Spinner } from './ui';

function safeHostname(url: string): string {
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return url.slice(0, 40);
  }
}

function ComponentCard({ icon, role, spec }: { icon: React.ReactNode; role: string; spec: ConsoleComponentSpec }) {
  const badges = [
    spec.maxResolution,
    spec.maxFps ? `${spec.maxFps}fps` : undefined,
    spec.hdr ? 'HDR' : undefined,
    spec.vrr ? 'VRR' : undefined,
  ].filter(Boolean) as string[];

  return (
    <div className="rounded-none border border-border bg-white/[0.02] p-3">
      <div className="flex items-center gap-2">
        <span className="text-text-muted">{icon}</span>
        <span className="text-[0.65rem] uppercase tracking-wider text-text-faint">{role}</span>
      </div>
      <p className="mt-1 truncate text-sm font-semibold text-text" title={spec.name}>{spec.name}</p>
      {badges.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {badges.map((badge) => (
            <span key={badge} className="border border-border px-1.5 py-0.5 text-[0.65rem] text-text-muted">{badge}</span>
          ))}
        </div>
      )}
      {spec.summary && <p className="mt-2 text-xs leading-relaxed text-text-muted">{spec.summary}</p>}
      {spec.notes && <p className="mt-1 text-xs leading-relaxed text-text-faint">{spec.notes}</p>}
    </div>
  );
}

export function ConsoleReport() {
  const { analysisTarget, consoleProfile, isAnalyzingConsole } = useAppStore();

  if (analysisTarget !== 'console') return null;

  if (isAnalyzingConsole) {
    return (
      <Section title="consola.analisis" icon={<IconTv className="h-4 w-4" />}>
        <div className="flex items-center gap-3">
          <Spinner />
          <span className="text-sm text-text-muted">Analizando tu cadena de consola...</span>
        </div>
      </Section>
    );
  }

  if (!consoleProfile) return null;

  const { profile } = consoleProfile;
  const sourceCount = profile.sources?.length ?? 0;
  const researchStatus = profile.research?.status
    ?? (sourceCount > 0 ? 'verified' : 'unavailable');

  return (
    <Section
      title="consola.analisis"
      icon={<IconTv className="h-4 w-4" />}
      subtitle="Como encajan tu consola, capturadora y monitor para la mejor captura posible."
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <ComponentCard icon={<IconTv className="h-4 w-4" />} role="consola" spec={profile.console} />
        <ComponentCard icon={<IconActivityDot />} role="capturadora" spec={profile.captureCard} />
        <ComponentCard icon={<IconMonitor className="h-4 w-4" />} role="monitor" spec={profile.monitor} />
      </div>

      <div className="mt-4 flex items-start gap-2 rounded-none border border-warning/35 bg-warning/[0.06] p-4 text-sm text-warning">
        <IconAlert className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <span className="block font-semibold">Cuello de botella</span>
          <span className="mt-0.5 block text-warning/90">{profile.bottleneck}</span>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2 rounded-none border border-secondary/35 bg-secondary/10 px-4 py-3 text-sm text-secondary">
        <IconCheck className="h-4 w-4 shrink-0" />
        <span>Captura recomendada: <strong>{profile.captureResolution}</strong> a <strong>{profile.captureFps}fps</strong></span>
      </div>

      <div className={`mt-3 flex items-start gap-2 rounded-none border px-4 py-3 text-sm ${researchStatus === 'verified'
        ? 'border-secondary/35 bg-secondary/10 text-secondary'
        : 'border-warning/35 bg-warning/[0.06] text-warning'}`}
      >
        {researchStatus === 'verified'
          ? <IconCheck className="mt-0.5 h-4 w-4 shrink-0" />
          : <IconAlert className="mt-0.5 h-4 w-4 shrink-0" />}
        <div>
          <span className="block font-semibold">Investigacion de hardware</span>
          <span className="mt-0.5 block opacity-90">
            {researchStatus === 'verified'
              ? `Especificaciones contrastadas con ${sourceCount} fuente${sourceCount === 1 ? '' : 's'} web mediante ${profile.research?.provider === 'ai_search' ? 'busqueda IA' : 'Tavily'}.`
              : researchStatus === 'no_results'
                ? 'La busqueda web se ejecuto, pero no encontro fuentes suficientemente relevantes. Se usaron las capacidades leidas por OBS y el perfil local.'
                : 'La busqueda web no estuvo configurada para este analisis. Se usaron las capacidades leidas por OBS y el perfil local.'}
          </span>
        </div>
      </div>

      {profile.consoleSettings.length > 0 && (
        <div className="mt-4 rounded-none border border-border bg-surface/45 p-4">
          <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-text-muted">Ajustes en la consola</span>
          <ol className="list-decimal space-y-1.5 pl-5 text-sm text-text-muted">
            {profile.consoleSettings.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>
      )}

      {profile.sources && profile.sources.length > 0 && (
        <p className="mt-3 text-xs text-text-faint">
          Fuentes consultadas:{' '}
          {profile.sources.map((url, index) => (
            <React.Fragment key={url}>
              {index > 0 && ' · '}
              <a href={url} target="_blank" rel="noreferrer" className="text-primary/80 underline hover:text-primary">{safeHostname(url)}</a>
            </React.Fragment>
          ))}
        </p>
      )}

      {consoleProfile.reasoning && <p className="mt-3 text-xs leading-relaxed text-text-muted">{consoleProfile.reasoning}</p>}
      <p className="mt-3 text-xs text-text-faint">Los ajustes de OBS recomendados (abajo) ya estan limitados al techo de tu captura.</p>
    </Section>
  );
}

function IconActivityDot() {
  return <span className="inline-block h-3.5 w-3.5 rounded-none border border-current" aria-hidden="true" />;
}
