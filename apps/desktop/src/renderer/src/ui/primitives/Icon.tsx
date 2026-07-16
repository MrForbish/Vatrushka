import type { ReactNode, SVGProps } from 'react';

export type IconName =
  | 'check'
  | 'chevronDown'
  | 'close'
  | 'eye'
  | 'eyeOff'
  | 'info'
  | 'minus'
  | 'search'
  | 'settings'
  | 'sparkles'
  | 'warning';

const paths: Record<IconName, ReactNode> = {
  check: <path d="m5 12 4 4L19 6" />,
  chevronDown: <path d="m7 10 5 5 5-5" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  eye: <><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.5" /></>,
  eyeOff: <><path d="m4 4 16 16M10.6 6.1A10.5 10.5 0 0 1 12 6c6 0 9.5 6 9.5 6a17 17 0 0 1-2.1 2.8M6.1 7.3C3.8 9.1 2.5 12 2.5 12s3.5 6 9.5 6c.8 0 1.5-.1 2.2-.3" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 10v6M12 7h.01" /></>,
  minus: <path d="M5 12h14" />,
  search: <><circle cx="11" cy="11" r="6" /><path d="m16 16 4 4" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" /></>,
  sparkles: <><path d="m12 3 1.2 3.3L16.5 7.5l-3.3 1.2L12 12l-1.2-3.3-3.3-1.2 3.3-1.2L12 3Z" /><path d="m18 13 .8 2.2L21 16l-2.2.8L18 19l-.8-2.2L15 16l2.2-.8L18 13ZM6 13l.7 1.8 1.8.7-1.8.7L6 18l-.7-1.8-1.8-.7 1.8-.7L6 13Z" /></>,
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
