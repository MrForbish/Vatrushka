import type {
  InternalNotification,
  UserNotificationPreferences,
  UserPresence,
} from "@vatrushka/shared";

import { quietHoursActive } from "./quiet-hours";

export interface NotificationPresentationInput {
  notification: Pick<InternalNotification, "conversationId" | "createdAt" | "type">;
  preferences: UserNotificationPreferences | null;
  presence: UserPresence | null;
  visibleConversationId: string | null;
  applicationIsVisible: boolean;
  now?: Date;
}

/**
 * Decides whether a newly received durable notification may interrupt the user
 * on this device. It never removes the notification from Focus Inbox or unread.
 */
export function shouldPresentNotification({
  notification,
  preferences,
  presence,
  visibleConversationId,
  applicationIsVisible,
  now = new Date(),
}: NotificationPresentationInput): boolean {
  if (now.getTime() - new Date(notification.createdAt).getTime() > 5 * 60_000)
    return false;
  if (presence?.preference === "do_not_disturb") return false;
  if (quietHoursActive(preferences, now)) return false;
  if (
    notification.type === "direct_message" &&
    preferences?.directMessagesEnabled === false
  )
    return false;
  if (
    (notification.type === "mention" || notification.type === "reply") &&
    preferences?.mentionsEnabled === false
  )
    return false;
  return !(
    applicationIsVisible &&
    notification.conversationId === visibleConversationId
  );
}
