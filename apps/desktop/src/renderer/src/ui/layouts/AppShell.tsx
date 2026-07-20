import { useEffect, useState, type ReactNode } from 'react';

import { Drawer } from '../overlays';
import { IconButton } from '../primitives';
import './app-shell.css';

export interface AppShellProps {
  workspaceLibrary: ReactNode;
  serverContext?: ReactNode;
  topBar: ReactNode;
  children: ReactNode;
  members?: ReactNode;
  workspaceDrawerTitle?: string;
  membersDrawerTitle?: string;
  variant?: 'default' | 'home' | 'settings';
  renderMembersToggle?: ((open: () => void) => ReactNode) | undefined;
}

export function AppShell({ children, members, membersDrawerTitle = 'Участники сервера', renderMembersToggle, serverContext, topBar, variant = 'default', workspaceDrawerTitle = 'Серверы', workspaceLibrary }: AppShellProps): React.JSX.Element {
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const hasMembers = members !== undefined && members !== null;

  useEffect(() => {
    let active = true;
    void window.desktop.getFullscreen().then((value) => {
      if (active) setFullscreen(value);
    }).catch(() => undefined);
    const unsubscribe = window.desktop.onFullscreenChange(setFullscreen);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return (
    <div className="vui-app-shell" data-has-members={hasMembers || undefined} data-has-server-context={serverContext === undefined ? undefined : true} data-variant={variant}>
      <div className="vui-app-shell__workspaces">{workspaceLibrary}</div>
      {serverContext === undefined ? null : <div className="vui-app-shell__server-context">{serverContext}</div>}
      <header className="vui-app-shell__topbar">
        <IconButton className="vui-app-shell__workspace-toggle" icon="panelLeft" label="Открыть список серверов" onClick={() => setWorkspaceOpen(true)} size="sm" type="button" />
        {topBar}
        <IconButton
          className="vui-app-shell__fullscreen-toggle"
          icon={fullscreen ? "fullscreenExit" : "fullscreen"}
          label={fullscreen ? "Выйти из полноэкранного режима" : "Открыть на весь экран"}
          onClick={() => {
            void window.desktop.toggleFullscreen().then(setFullscreen).catch(() => undefined);
          }}
          size="sm"
          type="button"
        />
        {hasMembers ? <span className="vui-app-shell__members-toggle">{renderMembersToggle === undefined ? <IconButton icon="panelRight" label="Открыть участников" onClick={() => setMembersOpen(true)} size="sm" type="button" /> : renderMembersToggle(() => setMembersOpen(true))}</span> : null}
      </header>
      <main className="vui-app-shell__content">{children}</main>
      {hasMembers ? <div className="vui-app-shell__members">{members}</div> : null}
      <Drawer onClose={() => setWorkspaceOpen(false)} open={workspaceOpen} side="left" title={workspaceDrawerTitle}><div className="vui-app-shell__drawer-content">{workspaceLibrary}</div></Drawer>
      {hasMembers ? <Drawer onClose={() => setMembersOpen(false)} open={membersOpen} side="right" title={membersDrawerTitle}><div className="vui-app-shell__drawer-content">{members}</div></Drawer> : null}
    </div>
  );
}
