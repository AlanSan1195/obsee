import React, { useEffect, useRef } from 'react';

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  children: React.ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleCancel = (event: Event) => {
      event.preventDefault();
      onCancel();
    };

    dialog.addEventListener('cancel', handleCancel);
    return () => dialog.removeEventListener('cancel', handleCancel);
  }, [onCancel]);

  return (
    <dialog
      ref={dialogRef}
      className="glass-card w-[min(92vw,640px)] rounded-none border-border bg-background/80 p-0 text-text shadow-2xl shadow-black/60"
    >
      <div className="p-6">
        <h2 className="mb-4 text-lg font-semibold tracking-tight text-text">{title}</h2>
        <div className="mb-6 space-y-3 text-sm leading-relaxed text-text">{children}</div>
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-none border border-border px-4 py-2.5 text-sm font-semibold text-text transition-colors hover:border-primary/40 hover:bg-white/[0.04]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-none bg-primary px-4 py-2.5 text-sm font-bold lowercase tracking-terminal text-background glow-primary transition-all hover:bg-primary-hover"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
