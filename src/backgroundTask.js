import AsyncStorage from '@react-native-async-storage/async-storage';
import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import notifee, { AndroidImportance, TriggerType, RepeatFrequency } from '@notifee/react-native';
import { getSettings } from './storage';
import { getAlarms, formatDateKey } from './alarmData';

export const TASK_NAME = 'GENBA_ALARM_BACKGROUND_CHECK';
export const CHANNEL_ID = 'genba_alarm';
const NOTIFICATION_ID = 'genba_prompt_notification';

export async function ensureChannel() {
  await notifee.createChannel({
    id: CHANNEL_ID,
    name: 'GENBAAlarm',
    importance: AndroidImportance.HIGH,
    sound: 'default',
  });
}

// 明日のアラームが登録済みかどうか
async function hasTomorrowAlarm() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowKey = formatDateKey(tomorrow);
  const alarms = await getAlarms();
  return alarms.some((a) => a.date === tomorrowKey);
}

// 今夜または翌日の指定時刻のタイムスタンプを返す
function nextTriggerTimestamp(hour, minute) {
  const now = new Date();
  const target = new Date();
  target.setHours(hour, minute, 0, 0);
  // すでに過ぎていたら翌日にする
  if (target <= now) {
    target.setDate(target.getDate() + 1);
  }
  return target.getTime();
}

// 促し通知を指定時刻にスケジュール（毎日繰り返し）
export async function schedulePromptNotification(hour, minute) {
  await ensureChannel();
  await notifee.cancelNotification(NOTIFICATION_ID);
  const trigger = {
    type: TriggerType.TIMESTAMP,
    timestamp: nextTriggerTimestamp(hour, minute),
    repeatFrequency: RepeatFrequency.DAILY,
    alarmManager: { allowWhileIdle: true },
  };
  await notifee.createTriggerNotification(
    {
      id: NOTIFICATION_ID,
      title: 'GENBAAlarm',
      body: '明日のアラームがセットされていません',
      android: {
        channelId: CHANNEL_ID,
        importance: AndroidImportance.HIGH,
        pressAction: { id: 'default' },
      },
    },
    trigger
  );
}

// 明日アラーム登録済みなら通知をキャンセル
export async function cancelPromptIfAlarmSet() {
  if (await hasTomorrowAlarm()) {
    await notifee.cancelNotification(NOTIFICATION_ID);
  }
}

// バックグラウンドタスク: 明日のアラームが登録済みなら通知をキャンセルするだけ
TaskManager.defineTask(TASK_NAME, async () => {
  try {
    await cancelPromptIfAlarmSet();
    return BackgroundFetch.BackgroundFetchResult.NoData;
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
    // 起動時に通知をスケジュール（未登録なら）
    const settings = await getSettings();
    await schedulePromptNotification(settings.notifyHour, settings.notifyMinute);
  } catch (e) {
    console.warn('Background task registration failed:', e);
  }
}
