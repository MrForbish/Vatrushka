import { useCallback, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';

import { Drawer } from '../overlays';
import { IconButton } from '../primitives';
import './app-shell.css';

export interface AppShellProps {
  globalSidebar: ReactNode;
  serverContext?: ReactNode;
  topBar?: ReactNode;
  children: ReactNode;
  members?: ReactNode;
  workspaceDrawerTitle?: string;
  membersDrawerTitle?: string;
  variant?: 'default' | 'home' | 'settings' | 'direct-messages';
  renderMembersToggle?: ((open: () => void) => ReactNode) | undefined;
}

export function AppShell({ children, globalSidebar, members, membersDrawerTitle = 'Участники сервера', renderMembersToggle, serverContext, topBar, variant = 'default', workspaceDrawerTitle = 'Навигация', }: AppShellProps): React.JSX.Element {
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [contextWidth, setContextWidth] = useState<number | null>(null);
  const [membersWidth, setMembersWidth] = useState<number | null>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const hasMembers = members !== undefined && members !== null;
  const canResize = variant === 'default';
  const resizeColumn = useCallback((column: 'context' | 'members', clientX: number): void => {
    const shell = shellRef.current;
    if (!shell) return;
    const bounds = shell.getBoundingClientRect();
    if (column === 'context') {
      const globalWidth = shell.querySelector<HTMLElement>('.vui-app-shell__workspaces')?.getBoundingClientRect().width ?? 224;
      setContextWidth(Math.round(Math.min(540, Math.max(270, clientX - bounds.left - globalWidth))));
      return;
    }
    setMembersWidth(Math.round(Math.min(500, Math.max(250, bounds.right - clientX))));
  }, []);
  const beginResize = (column: 'context' | 'members') => (event: PointerEvent<HTMLButtonElement>): void => {
    event.preventDefault();
    const onMove = (moveEvent: globalThis.PointerEvent): void => resizeColumn(column, moveEvent.clientX);
    const onEnd = (): void => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onEnd);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onEnd, { once: true });
  };
  const resizeByKey = (column: 'context' | 'members') => (event: KeyboardEvent<HTMLButtonElement>): void => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const current = column === 'context' ? contextWidth ?? 270 : membersWidth ?? 250;
    const direction = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
    const next = event.key === 'Home' ? 250 : event.key === 'End' ? (column === 'context' ? 540 : 500) : current + direction * 20;
    if (column === 'context') setContextWidth(Math.min(540, Math.max(270, next)));
    else setMembersWidth(Math.min(500, Math.max(250, next)));
  };
  const style = {
    '--shell-context-width': contextWidth === null ? undefined : `${contextWidth}px`,
    '--shell-inspector-width': membersWidth === null ? undefined : `${membersWidth}px`,
  } as CSSProperties;

  return (
    <div className="vui-app-shell" data-has-members={hasMembers || undefined} data-has-server-context={serverContext === undefined ? undefined : true} data-has-topbar={topBar === undefined ? undefined : true} data-variant={variant} ref={shellRef} style={style}>
      <aside aria-label="Глобальная навигация" className="vui-app-shell__workspaces">{globalSidebar}</aside>
      {serverContext === undefined ? null : <div className="vui-app-shell__server-context">{serverContext}</div>}
      {canResize && serverContext !== undefined ? <button aria-label="Изменить ширину списка каналов" aria-orientation="vertical" aria-valuemax={540} aria-valuemin={270} aria-valuenow={contextWidth ?? 270} className="vui-app-shell__resize vui-app-shell__resize--context" onKeyDown={resizeByKey('context')} onPointerDown={beginResize('context')} role="separator" type="button" /> : null}
      <section className="vui-app-shell__workspace">
        {topBar === undefined ? null : <header className="vui-app-shell__topbar">
          <IconButton className="vui-app-shell__workspace-toggle" icon="panelLeft" label="Открыть список серверов" onClick={() => setWorkspaceOpen(true)} size="sm" type="button" />
          {topBar}
          {hasMembers ? <span className="vui-app-shell__members-toggle">{renderMembersToggle === undefined ? <IconButton icon="panelRight" label="Открыть участников" onClick={() => setMembersOpen(true)} size="sm" type="button" /> : renderMembersToggle(() => setMembersOpen(true))}</span> : null}
        </header>}
        <main className="vui-app-shell__content">{children}</main>
      </section>
      {hasMembers ? <aside aria-label={membersDrawerTitle} className="vui-app-shell__members">{members}</aside> : null}
      {canResize && hasMembers ? <button aria-label="Изменить ширину списка участников" aria-orientation="vertical" aria-valuemax={500} aria-valuemin={250} aria-valuenow={membersWidth ?? 250} className="vui-app-shell__resize vui-app-shell__resize--members" onKeyDown={resizeByKey('members')} onPointerDown={beginResize('members')} role="separator" type="button" /> : null}
      <Drawer onClose={() => setWorkspaceOpen(false)} open={workspaceOpen} side="left" title={workspaceDrawerTitle}><div className="vui-app-shell__drawer-content">{globalSidebar}</div></Drawer>
      {hasMembers ? <Drawer onClose={() => setMembersOpen(false)} open={membersOpen} side="right" title={membersDrawerTitle}><div className="vui-app-shell__drawer-content">{members}</div></Drawer> : null}
    </div>
  );
}
