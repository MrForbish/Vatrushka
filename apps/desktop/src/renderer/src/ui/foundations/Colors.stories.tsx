import type { Meta, StoryObj } from '@storybook/react-vite';
import type { CSSProperties } from 'react';

import './foundations.stories.css';

const colors = [
  ['Canvas', '--color-canvas'],
  ['Surface 0', '--color-surface-0'],
  ['Surface 1', '--color-surface-1'],
  ['Surface 2', '--color-surface-2'],
  ['Surface 3', '--color-surface-3'],
  ['Primary', '--color-primary'],
  ['Cyan', '--color-cyan'],
  ['Success', '--color-success'],
  ['Warning', '--color-warning'],
  ['Danger', '--color-danger'],
  ['Founder', '--color-founder'],
  ['Focus', '--color-focus'],
] as const;

const meta = {
  title: 'Foundations/Colors',
  parameters: { layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Palette: Story = {
  render: () => (
    <main className="vui-story-surface vui-story-stack">
      <header>
        <h1 className="vui-story-heading">Цветовая система</h1>
        <p className="vui-story-description">Единые семантические токены для тёмного интерфейса Vatrushka.</p>
      </header>
      <div className="foundation-grid">
        {colors.map(([label, token]) => (
          <article className="color-swatch" key={token}>
            <div className="color-swatch__sample" style={{ '--swatch-color': `var(${token})` } as CSSProperties} />
            <div className="color-swatch__label"><strong>{label}</strong><span>{token}</span></div>
          </article>
        ))}
      </div>
    </main>
  ),
};
