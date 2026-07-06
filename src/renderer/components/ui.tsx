import React from 'react';

type IconProps = {
  className?: string;
};

function createIcon(paths: React.ReactNode, displayName: string) {
  function Icon({ className = 'h-5 w-5' }: IconProps) {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        aria-hidden="true"
      >
        {paths}
      </svg>
    );
  }
  Icon.displayName = displayName;
  return Icon;
}

export const IconVideo = createIcon(
  <>
    <path d="m16 10 5-3v10l-5-3" />
    <rect x="2" y="6" width="14" height="12" rx="2" />
  </>,
  'IconVideo',
);

export const IconTv = createIcon(
  <>
    <rect x="2" y="7" width="20" height="14" rx="2" />
    <polyline points="17 2 12 7 7 2" />
  </>,
  'IconTv',
);

export const IconClapperboard = createIcon(
  <>
    <path d="M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3Z" />
    <path d="m6.2 5.3 3.1 3.9" />
    <path d="m12.4 3.4 3.1 4" />
    <path d="M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
  </>,
  'IconClapperboard',
);

export const IconTwitch = createIcon(
  <>
    <path d="M21 2H3v16h5v4l4-4h5l4-4V2z" />
    <path d="M11 11V7" />
    <path d="M16 11V7" />
  </>,
  'IconTwitch',
);

export const IconYoutube = createIcon(
  <>
    <path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17" />
    <path d="m10 15 5-3-5-3z" />
  </>,
  'IconYoutube',
);

export const IconSparkles = createIcon(
  <>
    <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z" />
    <path d="M5 3v4" />
    <path d="M19 17v4" />
    <path d="M3 5h4" />
    <path d="M17 19h4" />
  </>,
  'IconSparkles',
);

export const IconCpu = createIcon(
  <>
    <rect x="4" y="4" width="16" height="16" rx="2" />
    <rect x="9" y="9" width="6" height="6" />
    <path d="M15 2v2" />
    <path d="M15 20v2" />
    <path d="M2 15h2" />
    <path d="M2 9h2" />
    <path d="M20 15h2" />
    <path d="M20 9h2" />
    <path d="M9 2v2" />
    <path d="M9 20v2" />
  </>,
  'IconCpu',
);

export const IconMonitor = createIcon(
  <>
    <rect x="2" y="3" width="20" height="14" rx="2" />
    <line x1="8" y1="21" x2="16" y2="21" />
    <line x1="12" y1="17" x2="12" y2="21" />
  </>,
  'IconMonitor',
);

export const IconMemory = createIcon(
  <>
    <path d="M6 19v-3" />
    <path d="M10 19v-3" />
    <path d="M14 19v-3" />
    <path d="M18 19v-3" />
    <path d="M8 11V9" />
    <path d="M16 11V9" />
    <path d="M12 11V9" />
    <path d="M2 15h20" />
    <path d="M2 7a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1Z" />
  </>,
  'IconMemory',
);

export const IconHardDrive = createIcon(
  <>
    <line x1="22" y1="12" x2="2" y2="12" />
    <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    <line x1="6" y1="16" x2="6.01" y2="16" />
    <line x1="10" y1="16" x2="10.01" y2="16" />
  </>,
  'IconHardDrive',
);

export const IconMic = createIcon(
  <>
    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <line x1="12" y1="19" x2="12" y2="22" />
  </>,
  'IconMic',
);

export const IconPlug = createIcon(
  <>
    <path d="M12 22v-5" />
    <path d="M9 8V2" />
    <path d="M15 8V2" />
    <path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z" />
  </>,
  'IconPlug',
);

export const IconUpload = createIcon(
  <>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </>,
  'IconUpload',
);

export const IconCheck = createIcon(
  <polyline points="20 6 9 17 4 12" />,
  'IconCheck',
);

export const IconAlert = createIcon(
  <>
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </>,
  'IconAlert',
);

export const IconX = createIcon(
  <>
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </>,
  'IconX',
);

export const IconRefresh = createIcon(
  <>
    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
    <path d="M21 3v5h-5" />
    <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
    <path d="M3 21v-5h5" />
  </>,
  'IconRefresh',
);

export const IconSliders = createIcon(
  <>
    <line x1="21" y1="4" x2="14" y2="4" />
    <line x1="10" y1="4" x2="3" y2="4" />
    <line x1="21" y1="12" x2="12" y2="12" />
    <line x1="8" y1="12" x2="3" y2="12" />
    <line x1="21" y1="20" x2="16" y2="20" />
    <line x1="12" y1="20" x2="3" y2="20" />
    <line x1="14" y1="2" x2="14" y2="6" />
    <line x1="8" y1="10" x2="8" y2="14" />
    <line x1="16" y1="18" x2="16" y2="22" />
  </>,
  'IconSliders',
);

export const IconActivity = createIcon(
  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />,
  'IconActivity',
);

export function Spinner({ className = 'h-5 w-5' }: IconProps) {
  return (
    <div
      aria-hidden="true"
      className={`animate-spin rounded-full border-2 border-primary border-t-transparent ${className}`}
    />
  );
}

type SectionProps = {
  title: string;
  icon?: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  accent?: boolean;
  children: React.ReactNode;
};

export function Section({ title, icon, subtitle, action, accent = false, children }: SectionProps) {
  return (
    <section
      className={`terminal-panel transition-colors ${
        accent
          ? 'border-primary/40 '
          : ''
      }`}
    >
      {/* terminal title bar */}
      <header
        className={`flex flex-col gap-2 border-b px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between ${
          accent ? 'border-primary/25 bg-primary/[0.04]' : 'border-border bg-surface/45'
        }`}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className={`h-2.5 w-2.5 shrink-0 ${accent ? 'bg-primary text-glow' : 'bg-secondary/70 glow-secondary'}`}
            aria-hidden="true"
          />
          {icon && (
            <span className={`shrink-0 ${accent ? 'text-primary' : 'text-secondary/80'}`}>
              {icon}
            </span>
          )}
          <h3
            className={`truncate text-sm font-medium lowercase tracking-terminal ${
              accent ? 'text-primary text-glow' : 'text-text'
            }`}
          >
            {title}
          </h3>
        </div>
        {action && <div className="flex flex-wrap items-center gap-2">{action}</div>}
      </header>
      {subtitle && (
        <div className="border-b border-border/60 bg-surface/30 px-4 py-2 text-xs lowercase text-text-muted">
          <span className="text-text-faint">$ </span>
          {subtitle}
        </div>
      )}
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}
