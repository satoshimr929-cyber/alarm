import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';
import * as Notifications from 'expo-notifications';
import {
  getAlarmsForDate,
  getTomorrow,
  getSettings,
  getSavedNotificationId,
  setSavedNotificationId,
} from './storage';

export const TASK_NAME = 'GENBA_ALARM_BACKGROUND_CHECK';

// アプリ起動時に必ず実行されるようモジュールスコープで定義
TaskManager.defineTask(TASK_NAME, async () => {
  try {
    const settings = await getSettings();
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const targetMinutes = settings.autoSetHour * 60 + settings.autoSetMinute;

    // 設定時刻の前後15分以内でなければスキップ
    if (Math.abs(currentMinutes - targetMinutes) > 15) {
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    const tomorrow = getTomorrow();
    const alarms = await getAlarmsForDate(tomorrow);

    if (alarms.length > 0) {
      const timeStr = alarms
        .map((a) => `${String(a.hour).padStart(2, '0')}:${String(a.minute).padStart(2, '0')}`)
        .join(', ');
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'GENBAAlarm',
          body: `明日 ${timeStr} のアラームをセットします　タップで実行`,
          data: { action: 'auto_set' },
          sound: true,
        },
        trigger: null,
      });
    } else {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'GENBAAlarm',
          body: '明日のアラームがセットされていません　タップして設定',
          data: { action: 'no_alarm' },
          sound: true,
        },
        trigger: null,
      });
    }

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
        minimumInterval: 15 * 60, // 最小15分間隔
        stopOnTerminate: false,   // アプリ終了後も継続
        startOnBoot: true,        // 再起動後も継続
      });
    }
  } catch (e) {
    console.warn('Background task registration failed:', e);
  }
}

// 毎日指定時刻に発火するスケジュール通知を設定
// バックグラウンドタスクが動かない場合のフォールバック
export async function scheduleAutoNotification(hour, minute) {
  // 既存の通知をキャンセル
  const oldId = await getSavedNotificationId();
  if (oldId) {
    await Notifications.cancelScheduledNotificationAsync(oldId).catch(() => {});
  }

  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: 'GENBAAlarm',
      body: '明日のアラームを確認する時間です　タップして設定/確認',
      data: { action: 'daily_check' },
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
    },
  });

  await setSavedNotificationId(id);
  return id;
}

export async function cancelAutoNotification() {
  const id = await getSavedNotificationId();
  if (id) {
    await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
    await setSavedNotificationId(null);
  }
}
