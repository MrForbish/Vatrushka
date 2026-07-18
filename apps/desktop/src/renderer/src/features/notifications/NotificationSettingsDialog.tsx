import { useEffect, useState } from 'react';

import type { ConversationNotificationPreferences, NotificationPreferenceLevel, ServerNotificationPreferences } from '@vatrushka/shared';

import { apiClient, ClientError } from '../../api';
import { Button, Modal, Select, Switch } from '../../ui';
import './notification-settings-dialog.css';

function errorMessage(error: unknown): string {
  return error instanceof ClientError ? error.message : error instanceof Error ? error.message : 'Не удалось сохранить настройки';
}

const levelOptions = [
  { value: 'all', label: 'Все сообщения' },
  { value: 'mentions', label: 'Только упоминания и ответы' },
  { value: 'none', label: 'Ничего' },
];

const muteOptions = [
  { value: 'none', label: 'Не выключать' },
  { value: '1h', label: 'На 1 час' },
  { value: '8h', label: 'На 8 часов' },
  { value: '24h', label: 'На 24 часа' },
  { value: '7d', label: 'На 7 дней' },
];

function mutedUntil(value: string): string | null {
  const durations: Record<string, number> = { '1h': 3_600_000, '8h': 8 * 3_600_000, '24h': 24 * 3_600_000, '7d': 7 * 24 * 3_600_000 };
  return value === 'none' ? null : new Date(Date.now() + (durations[value] ?? 0)).toISOString();
}

export interface NotificationSettingsDialogProps {
  open: boolean;
  conversationId: string;
  serverId?: string | undefined;
  title: string;
  onClose(): void;
}

export function NotificationSettingsDialog({ conversationId, onClose, open, serverId, title }: NotificationSettingsDialogProps): React.JSX.Element {
  const [conversation, setConversation] = useState<ConversationNotificationPreferences | null>(null);
  const [server, setServer] = useState<ServerNotificationPreferences | null>(null);
  const [conversationLevel, setConversationLevel] = useState<NotificationPreferenceLevel>('mentions');
  const [serverLevel, setServerLevel] = useState<NotificationPreferenceLevel>('mentions');
  const [conversationMute, setConversationMute] = useState('none');
  const [serverMute, setServerMute] = useState('none');
  const [suppressEveryone, setSuppressEveryone] = useState(false);
  const [suppressRoles, setSuppressRoles] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setBusy(true);
    setError(null);
    void Promise.all([apiClient.getConversationNotificationPreferences(conversationId), serverId ? apiClient.getServerNotificationPreferences(serverId) : Promise.resolve(null)]).then(([nextConversation, nextServer]) => {
      if (!active) return;
      setConversation(nextConversation);
      setConversationLevel(nextConversation.level);
      setConversationMute(nextConversation.mutedUntil && new Date(nextConversation.mutedUntil) > new Date() ? '1h' : 'none');
      setServer(nextServer);
      if (nextServer) {
        setServerLevel(nextServer.level);
        setServerMute(nextServer.mutedUntil && new Date(nextServer.mutedUntil) > new Date() ? '1h' : 'none');
        setSuppressEveryone(nextServer.suppressEveryone);
        setSuppressRoles(nextServer.suppressRoles);
      }
    }).catch((caught) => { if (active) setError(errorMessage(caught)); }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [conversationId, open, serverId]);

  const save = (): void => {
    setBusy(true);
    setError(null);
    void Promise.all([
      apiClient.updateConversationNotificationPreferences(conversationId, { level: conversationLevel, mutedUntil: mutedUntil(conversationMute) }),
      serverId ? apiClient.updateServerNotificationPreferences(serverId, { level: serverLevel, mutedUntil: mutedUntil(serverMute), suppressEveryone, suppressRoles }) : Promise.resolve(null),
    ]).then(([nextConversation, nextServer]) => { setConversation(nextConversation); setServer(nextServer); onClose(); }).catch((caught) => setError(errorMessage(caught))).finally(() => setBusy(false));
  };

  return <Modal footer={<><Button onClick={onClose} variant="quiet">Отмена</Button><Button disabled={conversation === null || (serverId !== undefined && server === null)} loading={busy} onClick={save}>Сохранить</Button></>} onClose={onClose} open={open} size="md" title={`Уведомления · ${title}`}>
    <div className="vui-notification-scope-settings">
      {serverId === undefined ? null : <section><h3>Сервер</h3><p>Базовый режим для всех каналов этого сервера.</p><Select label="События" onValueChange={(value) => setServerLevel(value as NotificationPreferenceLevel)} options={levelOptions} value={serverLevel} /><Select label="Выключить уведомления" onValueChange={setServerMute} options={muteOptions} value={serverMute} /><Switch checked={suppressEveryone} label="Не уведомлять о @everyone" onCheckedChange={setSuppressEveryone} /><Switch checked={suppressRoles} label="Не уведомлять об упоминаниях ролей" onCheckedChange={setSuppressRoles} /></section>}
      <section><h3>{serverId === undefined ? 'Диалог' : 'Текущий канал'}</h3><p>Эта настройка имеет приоритет над режимом сервера.</p><Select label="События" onValueChange={(value) => setConversationLevel(value as NotificationPreferenceLevel)} options={levelOptions} value={conversationLevel} /><Select label="Выключить уведомления" onValueChange={setConversationMute} options={muteOptions} value={conversationMute} /></section>
      {error ? <div className="vui-notification-scope-settings__error" role="alert">{error}</div> : null}
    </div>
  </Modal>;
}
