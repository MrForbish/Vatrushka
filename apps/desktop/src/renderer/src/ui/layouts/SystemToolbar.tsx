import type { ReactNode } from 'react';

import './system-toolbar.css';

export interface SystemToolbarProps {
  children?: ReactNode;
}

/**
 * Keeps application-level controls in the native-window titlebar zone without
 * reimplementing Windows window controls or widening the Electron boundary.
 */
export function SystemToolbar({ children }: SystemToolbarProps): React.JSX.Element {
  return <aside aria-label="Системная панель" className="vui-system-toolbar">{children}</aside>;
}
