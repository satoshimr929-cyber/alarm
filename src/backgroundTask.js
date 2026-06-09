import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';
import notifee, {
  AndroidCategory,
  AndroidImportance,
  TriggerType,
  RepeatFrequency,
} from '@notifee/react-native';
import {
  getAlarmsForDate,
  getTomorrow,
  getSettings,
  getSavedNotificationId,
  setSavedNotificationId,
} from './storage';

export const TASK_NAME = 'GENBA_ALARM_BACKGROUND_CHECK';
export const CHANNEL_ID = 'genba_alarm';

export async function ensureChannel() {
  await notifee.createChannel({
    id: CHANNEL_ID,
    name: 'GENBAAlarm',
    importance: AndroidImportance.HIGH,
    sound: 'default',
    bypassDnd: true,
    category: AndroidCategory.ALARM,
  });
}

TaskManager.defineTask(TASK_NAME, async () => {
  try {
    const settings = await getSettings();
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const targetMinutes = settings.autoSetHour * 60 + settings.autoSetMinute;

    if (Math.abs(currentMinutes - targetMinutes) > 15) {
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    await ensureChannel();
    const tomorrow = getTomorrow();
    const alarms = await getAlarmsForDate(tomorrow);

    const body =
      alarms.length > 0
        ? `明日 ${alarms.map((a) => `${String(a.hour).padStart(2, '0')}:${String(a.minute).padStart(2, '0')}`).join(', ')} をセットします　タップで実行`
        : '明日のアラームがセットされていません　タップして設定';

    await notifee.displayNotification({
      title: 'GENBAAlarm',
      body,
      data: { action: alarms.length > 0 ? 'auto_set' : 'no_alarm' },
      android: {
        channelId: CHANNEL_ID,
        category: AndroidCategory.ALARM,
        importance: AndroidImportance.HIGH,
        sound: 'default',
        bypassDnd: true,
      },
    });

    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch {
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

export async function registerBackgroundTask() {
  try {
    const registered = await TaskManager.isTaskRegisteredAsync(TASK_NAME);
    if (!registered) {
      await BackgroundFetch.registerTaskAsync(TASK_NAME, {
        minimumInterval: 15 * 60,
        stopOnTerminate: false,
        startOnBoot: true,
      });
    }
  } catch (e) {
    console.warn('Background task registration failed:', e);
  }
}

export async function scheduleAutoNotification(hour, minute) {
  await ensureChannel();

  const oldId = await getSavedNotificationId();
  if (oldId) {
    await notifee.cancelTriggerNotification(oldId).catch(() => {});
  }

  const trigger = new Date();
  trigger.setHours(hour, minute, 0, 0);
  if (trigger <= new Date()) {
    trigger.setDate(trigger.getDate() + 1);
  }

  const id = await notifee.createTriggerNotification(
    {
      title: 'GENBAAlarm',
      body: '明日のアラームを確認する時間です　タップして設定/確認',
      data: { action: 'daily_check' },
      android: {
        channelId: CHANNEL_ID,
        category: AndroidCategory.ALARM,
        importance: AndroidImportance.HIGH,
        sound: 'default',
        bypassDnd: true,
      },
    },
    {
      type: TriggerType.TIMESTAMP,
      timestamp: trigger.getTime(),
      repeatFrequency: RepeatFrequency.DAILY,
    }
  );

  await setSavedNotificationId(id);
  return id;
}

export async function cancelAutoNotification() {
  const id = await getSavedNotificationId();
  if (id) {
    await notifee.cancelTriggerNotification(id).catch(() => {});
    await setSavedNotificationId(null);
  }
}
