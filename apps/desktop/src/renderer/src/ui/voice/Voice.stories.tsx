import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';

import { VoiceControlButton, VoiceControlDock, VoiceParticipantStrip, VoiceParticipantTile, type VoiceParticipantViewModel } from './Voice';

interface VoiceStageStoryProps {
  onLocalMute: (id: string, muted: boolean) => void;
  onMute: () => void;
  onVolume: (id: string, volume: number) => void;
}

const participants: VoiceParticipantViewModel[] = [
  { id: 'founder', name: 'Илья Форбиш', isLocal: true, isMuted: false, isSpeaking: false, audioLevel: 0.06, badge: 'founder', statusLabel: 'Вы' },
  { id: 'anna', name: 'Анна Белова', isMuted: false, isSpeaking: true, audioLevel: 0.78, volume: 1, statusLabel: 'Отличное соединение' },
  { id: 'max', name: 'Максим Орлов', isMuted: true, isSpeaking: false, audioLevel: 0, volume: 0.65, statusLabel: 'Хорошее соединение' },
];

function VoiceStageStory({ onLocalMute, onMute, onVolume }: VoiceStageStoryProps): React.JSX.Element {
  return <div style={{ display: 'grid', gridTemplateRows: 'minmax(320px, 1fr) auto auto', alignItems: 'center', gap: 16, minHeight: 680, padding: 24, background: 'var(--color-surface-1)' }}><div style={{ display: 'grid', width: '100%', placeItems: 'center' }}><VoiceParticipantTile canKick featured onKick={fn()} onLocalMute={onLocalMute} onVolume={onVolume} participant={participants[1]!} /></div><VoiceParticipantStrip onLocalMute={onLocalMute} onVolume={onVolume} participants={[participants[0]!, participants[2]!]} /><VoiceControlDock><VoiceControlButton icon="mic" label="Выключить микрофон" onClick={onMute} testId="story-mute" /><VoiceControlButton icon="screen" label="Показать экран" onClick={fn()} /><VoiceControlButton danger icon="logout" label="Выйти" onClick={fn()} /></VoiceControlDock></div>;
}

const meta = {
  title: 'Voice/Voice Stage',
  component: VoiceStageStory,
  parameters: { layout: 'fullscreen' },
  args: { onLocalMute: fn(), onMute: fn(), onVolume: fn() },
} satisfies Meta<typeof VoiceStageStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ActiveSpeaker: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Говорит')).toBeInTheDocument();
    const activeTile = canvas.getAllByRole('article')[0]!;
    await userEvent.hover(activeTile);
    await userEvent.click(within(activeTile).getByRole('button', { name: 'Действия с участником Анна Белова' }));
    const documentBody = within(canvasElement.ownerDocument.body);
    await userEvent.click(await documentBody.findByRole('menuitem', { name: 'Отключить звук' }));
    await expect(args.onLocalMute).toHaveBeenCalledWith('anna', true);
    await userEvent.click(canvas.getByRole('button', { name: 'Выключить микрофон' }));
    await expect(args.onMute).toHaveBeenCalledOnce();
  },
};

export const VisualStage: Story = {};

export const MutedParticipant: Story = {
  render: (args) => <div style={{ width: 340, padding: 24, background: 'var(--color-surface-1)' }}><VoiceParticipantTile onLocalMute={args.onLocalMute} onVolume={args.onVolume} participant={{ ...participants[2]!, locallyMuted: true }} /></div>,
};
