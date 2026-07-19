import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';

import type { DesktopSourceInfo } from '@vatrushka/shared';

import { SourcePicker } from './SourcePicker';

function preview(title: string, accent: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#07111b"/><rect x="18" y="18" width="604" height="42" rx="8" fill="#142334"/><circle cx="42" cy="39" r="7" fill="${accent}"/><text x="62" y="45" fill="#f4f7fb" font-family="Segoe UI" font-size="16">${title}</text><rect x="18" y="76" width="150" height="266" rx="8" fill="#0f1c2a"/><rect x="184" y="76" width="438" height="130" rx="8" fill="${accent}" opacity=".24"/><rect x="184" y="222" width="210" height="120" rx="8" fill="#142334"/><rect x="410" y="222" width="212" height="120" rx="8" fill="#142334"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const sources: DesktopSourceInfo[] = [
  { id: 'screen:1:0', name: 'Экран 1', thumbnailDataUrl: preview('Основной монитор', '#7a5af8'), type: 'screen', displayName: 'LG UltraGear', width: 2560, height: 1440, audioAvailable: true },
  { id: 'screen:2:0', name: 'Экран 2', thumbnailDataUrl: preview('Дополнительный монитор', '#39c6e6'), type: 'screen', displayName: 'DELL U2415', width: 1920, height: 1200, audioAvailable: true },
  { id: 'window:2:0', name: 'Figma — Vatrushka Design', thumbnailDataUrl: preview('Figma — Vatrushka Design', '#ff5b6e'), type: 'window', audioAvailable: true },
  { id: 'window:3:0', name: 'Visual Studio Code', thumbnailDataUrl: preview('Visual Studio Code', '#39c6e6'), type: 'window', audioAvailable: true },
];

const meta = {
  title: 'Features/Screen Share',
  component: SourcePicker,
  parameters: { layout: 'fullscreen' },
  args: {
    sources,
    platform: 'win32',
    busy: false,
    onSelect: fn(),
    onCancel: fn(),
  },
} satisfies Meta<typeof SourcePicker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const VisualPicker: Story = {};

export const SelectApplication: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: /^Окно приложения$/u }));
    await userEvent.click(canvas.getByRole('button', { name: 'Visual Studio Code, Только выбранное окно' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Начать демонстрацию' }));
    await expect(args.onSelect).toHaveBeenCalledWith(
      sources[3],
      '1080p60',
      false,
    );
  },
};
