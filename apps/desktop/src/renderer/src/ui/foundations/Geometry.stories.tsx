import type { Meta, StoryObj } from '@storybook/react-vite';
import type { CSSProperties } from 'react';

import './foundations.stories.css';

const spaces = ['--space-1', '--space-2', '--space-3', '--space-4', '--space-5', '--space-6', '--space-8', '--space-10', '--space-12'] as const;
const radii = ['--radius-xs', '--radius-sm', '--radius-md', '--radius-lg', '--radius-xl', '--radius-round'] as const;

const meta = { title: 'Foundations/Spacing, Radius & Elevation', parameters: { layout: 'fullscreen' } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const Geometry: Story = {
  render: () => (
    <main className="vui-story-surface vui-story-stack">
      <section className="vui-story-stack">
        <header><h1 className="vui-story-heading">Сетка 4 px</h1><p className="vui-story-description">Девять шагов покрывают плотный UI и крупные композиционные отступы.</p></header>
        {spaces.map((token) => (
          <div className="spacing-row" key={token}><code>{token}</code><span className="spacing-row__bar" style={{ '--spacing-width': `var(${token})` } as CSSProperties} /></div>
        ))}
      </section>
      <section className="vui-story-stack">
        <h2 className="vui-story-heading">Радиусы</h2>
        <div className="foundation-grid">
          {radii.map((token) => <div className="radius-card" key={token} style={{ '--sample-radius': `var(${token})` } as CSSProperties}>{token}</div>)}
        </div>
      </section>
      <section className="vui-story-stack">
        <h2 className="vui-story-heading">Высота</h2>
        <div className="foundation-grid">
          <div className="shadow-card" style={{ '--sample-shadow': 'var(--shadow-float)' } as CSSProperties}>Floating panel</div>
          <div className="shadow-card" style={{ '--sample-shadow': 'var(--shadow-modal)' } as CSSProperties}>Modal surface</div>
          <div className="shadow-card" style={{ '--sample-shadow': 'var(--shadow-focus)' } as CSSProperties}>Focus ring</div>
        </div>
      </section>
    </main>
  ),
};
