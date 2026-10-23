import { Platform } from 'react-native';

export const DEFAULT_NOTIFICATION_CHANNEL = 'default';
let handlerSet = false;

/** Android 13+ needs a channel before the notification permission prompt. */
export async function prepareNotifications(N: any): Promise<void> {
  if (Platform.OS === 'android') {
    await N.setNotificationChannelAsync(DEFAULT_NOTIFICATION_CHANNEL, {
      name: 'SanayiX Bildirimleri',
      importance: N.AndroidImportance?.DEFAULT ?? 3,
    });
  }
  if (!handlerSet) {
    N.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true, shouldShowList: true,
        shouldPlaySound: true, shouldSetBadge: false,
      }),
    });
    handlerSet = true;
  }
}
