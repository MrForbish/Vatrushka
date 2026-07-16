import { useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { Button, IconButton } from '../primitives';
import { useOverlayFocus } from './useOverlayFocus';
import './overlays.css';

export interface ModalProps {
  open: boolean;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  closeLabel?: string;
  onClose: () => void;
  closeOnBackdrop?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export function Modal({ children, closeLabel = 'Закрыть окно', closeOnBackdrop = true, description, footer, onClose, open, size = 'md', title }: ModalProps): React.JSX.Element | null {
  const panelRef = useRef<HTMLElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useOverlayFocus(open, panelRef, onClose);

  if (!open) return null;
  return createPortal(
    <div
      className="vui-overlay"
      onMouseDown={(event) => {
        if (closeOnBackdrop && event.target === event.currentTarget) onClose();
      }}
    >
      <section
        aria-describedby={description === undefined ? undefined : descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className={`vui-modal vui-modal--${size}`}
        ref={panelRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className="vui-overlay__header">
          <div><h2 id={titleId}>{title}</h2>{description === undefined ? null : <p id={descriptionId}>{description}</p>}</div>
          <IconButton icon="close" label={closeLabel} onClick={onClose} size="sm" />
        </header>
        <div className="vui-overlay__content">{children}</div>
        {footer === undefined ? null : <footer className="vui-overlay__footer">{footer}</footer>}
      </section>
    </div>,
    document.body,
  );
}

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmDialog({ cancelLabel = 'Отмена', confirmLabel = 'Подтвердить', danger = false, description, loading = false, onClose, onConfirm, open, title }: ConfirmDialogProps): React.JSX.Element | null {
  return (
    <Modal
      footer={<><Button onClick={onClose} variant="quiet">{cancelLabel}</Button><Button loading={loading} onClick={onConfirm} variant={danger ? 'danger' : 'primary'}>{confirmLabel}</Button></>}
      onClose={onClose}
      open={open}
      size="sm"
      title={title}
    >
      <p className="vui-confirm-copy">{description}</p>
    </Modal>
  );
}

export interface DrawerProps {
  open: boolean;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  side?: 'left' | 'right';
}

export function Drawer({ children, description, footer, onClose, open, side = 'right', title }: DrawerProps): React.JSX.Element | null {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useOverlayFocus(open, panelRef, onClose);

  if (!open) return null;
  return createPortal(
    <div className="vui-overlay vui-overlay--drawer" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div
        aria-describedby={description === undefined ? undefined : descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className={`vui-drawer vui-drawer--${side}`}
        ref={panelRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className="vui-overlay__header">
          <div><h2 id={titleId}>{title}</h2>{description === undefined ? null : <p id={descriptionId}>{description}</p>}</div>
          <IconButton icon="close" label="Закрыть панель" onClick={onClose} size="sm" />
        </header>
        <div className="vui-overlay__content">{children}</div>
        {footer === undefined ? null : <footer className="vui-overlay__footer">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}
