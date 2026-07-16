import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';

import { Button } from '../primitives';
import { MessageComposer, MessageList, SystemMessageCard, UnreadDivider, type MessageViewModel } from './Messaging';

const messages: MessageViewModel[] = [
  { id: '1', authorId: 'founder', authorName: 'Илья Форбиш', authorBadge: 'founder', content: 'Собрал новый App Shell. Проверьте адаптивный режим.', createdAt: '2026-07-17T09:00:00.000Z', own: true, canEdit: true, canDelete: true, attachments: [{ id: 'attachment-1', fileName: 'vatrushka-foundations.pdf', mimeType: 'application/pdf', size: 483_328, canDelete: true }], reactions: [{ emoji: '🔥', count: 4, reactedByCurrentUser: true }, { emoji: '👏', count: 2 }] },
  { id: '2', authorId: 'founder', authorName: 'Илья Форбиш', authorBadge: 'founder', content: 'Особенно drawer участников на ширине 1180 px.', createdAt: '2026-07-17T09:02:00.000Z', own: true, canEdit: true, canDelete: true },
  { id: '3', authorId: 'anna', authorName: 'Анна Белова', content: 'Выглядит отлично. Оставила один комментарий к composer.', createdAt: '2026-07-17T09:08:00.000Z', replyPreview: { authorName: 'Илья Форбиш', content: 'Собрал новый App Shell…' }, reactions: [{ emoji: '✅', count: 1 }] },
];

const meta = {
  title: 'Messaging/Text Channel',
  component: MessageList,
  parameters: { layout: 'fullscreen' },
  args: { messages, channelName: 'общий', onDelete: fn(), onDeleteAttachment: fn(), onDownloadAttachment: fn(), onEdit: fn(), onReply: fn(), onReaction: fn() },
  decorators: [(Story) => <div style={{ height: 620, background: 'var(--color-surface-1)' }}><Story /></div>],
} satisfies Meta<typeof MessageList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Conversation: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getAllByRole('button', { name: 'Редактировать сообщение' })[0]!);
    await expect(args.onEdit).toHaveBeenCalledWith(messages[0]);
    await userEvent.click(canvas.getByRole('button', { name: '🔥 4' }));
    await expect(args.onReaction).toHaveBeenCalledWith('1', '🔥');
    await userEvent.click(canvas.getByRole('button', { name: 'Скачать vatrushka-foundations.pdf' }));
    await expect(args.onDownloadAttachment).toHaveBeenCalledWith('attachment-1', 'vatrushka-foundations.pdf');
  },
};

function ComposerScenario(): React.JSX.Element {
  const [value, setValue] = useState('Исправленный текст сообщения');
  return <div className="vui-story-stack" style={{ padding: 24 }}><MessageComposer attachments={[{ id: 'draft-file', name: 'preview.webp', size: 192_000, mimeType: 'image/webp' }]} channelName="общий" context={{ mode: 'reply', label: 'Анна: Посмотри макет…' }} onCancelContext={() => undefined} onChange={setValue} onFilesSelected={() => undefined} onRemoveAttachment={() => undefined} onSubmit={() => undefined} value={value} /><MessageComposer canSend={false} channelName="объявления" onChange={() => undefined} onSubmit={() => undefined} value="" /></div>;
}

export const ComposerStates: Story = { render: () => <ComposerScenario /> };

export const SystemAndUnread: Story = {
  render: () => <div className="vui-story-stack" style={{ padding: 24 }}><SystemMessageCard action={<Button size="sm">Подключиться</Button>} description="Анна начала демонстрацию экрана в голосовом канале." icon="voice" title="Началась трансляция" tone="primary" /><UnreadDivider /><SystemMessageCard description="Роль «Модератор» получила право удалять сообщения." icon="warning" title="Права роли изменены" tone="warning" /></div>,
};
