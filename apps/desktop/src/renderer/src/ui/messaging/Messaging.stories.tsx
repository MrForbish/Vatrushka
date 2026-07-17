import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';

import type { MessageMentionInput } from '@vatrushka/shared';

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

const longConversation: MessageViewModel[] = Array.from({ length: 200 }, (_, index) => ({
  id: `long-${index + 1}`,
  authorId: index % 3 === 0 ? 'anna' : 'founder',
  authorName: index % 3 === 0 ? 'Анна Белова' : 'Илья Форбиш',
  content: `Виртуализированное сообщение ${index + 1}. ${index % 7 === 0 ? 'Дополнительная строка проверяет динамическую высоту карточки и стабильность прокрутки.' : ''}`,
  createdAt: new Date(Date.UTC(2026, 6, 17, 9, index)).toISOString(),
}));

export const LongConversation: Story = {
  args: { messages: longConversation },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => expect(canvas.getByText(/Виртуализированное сообщение 200/u)).toBeVisible());
    await expect(canvas.getAllByRole('article').length).toBeLessThan(60);
  },
};

function ComposerScenario(): React.JSX.Element {
  const [value, setValue] = useState('Исправленный текст сообщения');
  return <div className="vui-story-stack" style={{ padding: 24 }}><MessageComposer attachments={[{ id: 'draft-file', name: 'preview.webp', size: 192_000, mimeType: 'image/webp' }]} channelName="общий" context={{ mode: 'reply', label: 'Анна: Посмотри макет…' }} onCancelContext={() => undefined} onChange={setValue} onFilesSelected={() => undefined} onRemoveAttachment={() => undefined} onSubmit={() => undefined} value={value} /><MessageComposer canSend={false} channelName="объявления" onChange={() => undefined} onSubmit={() => undefined} value="" /></div>;
}

export const ComposerStates: Story = { render: () => <ComposerScenario /> };

function MentionComposerScenario(): React.JSX.Element {
  const [value, setValue] = useState('');
  const [mentions, setMentions] = useState<MessageMentionInput[]>([]);
  return <div style={{ minHeight: 360, padding: '180px 24px 24px' }}><MessageComposer channelName="общий" mentionCandidates={[{ userId: '11111111-1111-4111-8111-111111111111', displayName: 'Анна Белова' }, { userId: '22222222-2222-4222-8222-222222222222', displayName: 'Илья Форбиш' }]} mentions={mentions} onChange={setValue} onMentionsChange={setMentions} onSubmit={() => undefined} value={value} /></div>;
}

export const MentionAutocomplete: Story = { render: () => <MentionComposerScenario /> };

export const MentionKeyboardSelection: Story = {
  render: () => <MentionComposerScenario />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const editor = canvas.getByRole('textbox', { name: 'Сообщение' });
    await userEvent.type(editor, '@ан');
    await expect(canvas.getByRole('listbox', { name: 'Упомянуть участника' })).toBeVisible();
    await userEvent.keyboard('{Enter}');
    await expect(editor).toHaveValue('@Анна Белова');
  },
};

export const SystemAndUnread: Story = {
  render: () => <div className="vui-story-stack" style={{ padding: 24 }}><SystemMessageCard action={<Button size="sm">Подключиться</Button>} description="Анна начала демонстрацию экрана в голосовом канале." icon="voice" title="Началась трансляция" tone="primary" /><UnreadDivider /><SystemMessageCard description="Роль «Модератор» получила право удалять сообщения." icon="warning" title="Права роли изменены" tone="warning" /></div>,
};
