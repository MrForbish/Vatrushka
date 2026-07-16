import type { ReactNode, SVGProps } from 'react';

export type IconName =
  | 'attachment'
  | 'bell'
  | 'check'
  | 'chevronDown'
  | 'close'
  | 'copy'
  | 'download'
  | 'eye'
  | 'eyeOff'
  | 'edit'
  | 'emoji'
  | 'hash'
  | 'headphones'
  | 'home'
  | 'info'
  | 'invite'
  | 'link'
  | 'lock'
  | 'logout'
  | 'message'
  | 'mic'
  | 'micOff'
  | 'minus'
  | 'panelLeft'
  | 'panelRight'
  | 'plus'
  | 'reply'
  | 'refresh'
  | 'search'
  | 'send'
  | 'screen'
  | 'settings'
  | 'sparkles'
  | 'users'
  | 'voice'
  | 'volume'
  | 'volumeOff'
  | 'warning';

const paths: Record<IconName, ReactNode> = {
  attachment: <path d="m21.4 11.6-8.9 8.9a6 6 0 0 1-8.5-8.5l9.5-9.5a4 4 0 0 1 5.7 5.7l-9.6 9.5a2 2 0 0 1-2.8-2.8l8.9-8.9" />,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z" /><path d="M10 21h4" /></>,
  check: <path d="m5 12 4 4L19 6" />,
  chevronDown: <path d="m7 10 5 5 5-5" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  copy: <><rect x="8" y="8" width="11" height="11" rx="2" /><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" /></>,
  download: <><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></>,
  eye: <><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.5" /></>,
  eyeOff: <><path d="m4 4 16 16M10.6 6.1A10.5 10.5 0 0 1 12 6c6 0 9.5 6 9.5 6a17 17 0 0 1-2.1 2.8M6.1 7.3C3.8 9.1 2.5 12 2.5 12s3.5 6 9.5 6c.8 0 1.5-.1 2.2-.3" /></>,
  edit: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4L16.5 3.5Z" /></>,
  emoji: <><circle cx="12" cy="12" r="9" /><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01" /></>,
  hash: <><path d="M5 9h14M4 15h14M10 3 8 21M16 3l-2 18" /></>,
  headphones: <><path d="M4 14v-2a8 8 0 0 1 16 0v2" /><path d="M4 14h3v6H5a1 1 0 0 1-1-1v-5ZM20 14h-3v6h2a1 1 0 0 0 1-1v-5Z" /></>,
  home: <><path d="m3 11 9-8 9 8" /><path d="M5 10v10h14V10M9 20v-6h6v6" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 10v6M12 7h.01" /></>,
  invite: <><circle cx="9" cy="8" r="4" /><path d="M2.5 21a6.5 6.5 0 0 1 13 0M19 8v6M16 11h6" /></>,
  link: <><path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1" /><path d="M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1" /></>,
  lock: <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
  logout: <><path d="M10 4H5v16h5M14 8l4 4-4 4M18 12H9" /></>,
  message: <><path d="M4 5h16v12H8l-4 4V5Z" /><path d="M8 9h8M8 13h5" /></>,
  mic: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 10v3a7 7 0 0 0 14 0v-3M12 20v2" /></>,
  micOff: <><path d="m4 4 16 16M9 9v2a3 3 0 0 0 4.8 2.4M15 9V6a3 3 0 0 0-5.1-2.1M18.4 15.5A7 7 0 0 0 19 11M5 11a7 7 0 0 0 10.7 5.9M12 18v3M9 21h6" /></>,
  minus: <path d="M5 12h14" />,
  panelLeft: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /></>,
  panelRight: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M15 4v16" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  reply: <><path d="m9 17-5-5 5-5" /><path d="M20 18v-2a4 4 0 0 0-4-4H4" /></>,
  refresh: <><path d="M20 7v5h-5" /><path d="M4 17v-5h5M6.1 8a7 7 0 0 1 11.7-2.6L20 7M4 17l2.2 1.6A7 7 0 0 0 18 16" /></>,
  search: <><circle cx="11" cy="11" r="6" /><path d="m16 16 4 4" /></>,
  send: <><path d="m22 2-7 20-4-9-9-4 20-7Z" /><path d="M22 2 11 13" /></>,
  screen: <><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8M12 17v4M9 10l3-3 3 3M12 7v6" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" /></>,
  sparkles: <><path d="m12 3 1.2 3.3L16.5 7.5l-3.3 1.2L12 12l-1.2-3.3-3.3-1.2 3.3-1.2L12 3Z" /><path d="m18 13 .8 2.2L21 16l-2.2.8L18 19l-.8-2.2L15 16l2.2-.8L18 13ZM6 13l.7 1.8 1.8.7-1.8.7L6 18l-.7-1.8-1.8-.7 1.8-.7L6 13Z" /></>,
  users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" /></>,
  voice: <><path d="M8 10v4a4 4 0 0 0 8 0v-4" /><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M12 18v3M9 21h6" /></>,
  volume: <><path d="M11 5 6 9H2v6h4l5 4V5Z" /><path d="M15.5 8.5a5 5 0 0 1 0 7M18 5a9 9 0 0 1 0 14" /></>,
  volumeOff: <><path d="M11 5 6 9H2v6h4l5 4V5Z" /><path d="m16 9 5 5M21 9l-5 5" /></>,
  warning: <><path d="M12 3 2.8 20h18.4L12 3Z" /><path d="M12 9v5M12 17h.01" /></>,
};

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName;
  label?: string;
  size?: number;
}

export function Icon({ name, label, size = 20, ...props }: IconProps): React.JSX.Element {
  return (
    <svg
      {...props}
      aria-hidden={label === undefined}
      aria-label={label}
      fill="none"
      height={size}
      role={label === undefined ? undefined : 'img'}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
      width={size}
    >
      {paths[name]}
    </svg>
  );
}
