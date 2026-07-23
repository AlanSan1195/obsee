import { useEffect, useRef } from 'react';
import { Spinner } from './ui';

interface GoalComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  busy?: boolean;
  compact?: boolean;
}

export function GoalComposer({
  value,
  onChange,
  onSubmit,
  busy = false,
  compact = false,
}: GoalComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = '0px';
    textarea.style.height = `${Math.min(textarea.scrollHeight, compact ? 150 : 240)}px`;
  }, [compact, value]);

  return (
    <div className={`goal-composer ${compact ? 'goal-composer--compact' : ''}`}>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            onSubmit();
          }
        }}
        rows={compact ? 2 : 4}
        maxLength={2000}
        placeholder="Describe qué quieres transmitir o grabar, dónde lo publicarás y la calidad que buscas…"
        aria-label="Describe tu objetivo para OBS"
        className="goal-composer__input"
      />
      <div className="goal-composer__footer">
        <span className="goal-composer__hint">
          {value.length > 0 ? `${value.length}/2000` : 'Enter para enviar · Shift + Enter para otra línea'}
        </span>
        <button
          type="button"
          onClick={onSubmit}
          disabled={busy || value.trim().length < 8}
          aria-label={busy ? 'Analizando objetivo' : 'Enviar objetivo'}
          className="goal-composer__send"
        >
          {busy ? (
            <Spinner className="h-5 w-5 border-background/70 border-t-transparent" />
          ) : (
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 19V5M6.5 10.5 12 5l5.5 5.5" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
