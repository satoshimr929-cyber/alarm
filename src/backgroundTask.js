import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import notifee, { AlarmType, AndroidImportance, TriggerType, RepeatFrequency } from '@notifee/react-native';
import { getSettings } from './storage';
import { getAlarms, formatDateKey } from './alarmData';
import { canScheduleExactAlarms } from './nativeAlarm';

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

// 今日の指定時刻。すでに過ぎていたら翌日の同時刻
function nextTriggerTimestamp(hour, minute) {
  const now = new Date();
  const target = new Date();
  target.setHours(hour, minute, 0, 0);
  if (target <= now) {
    target.setDate(target.getDate() + 1);
  }
  return target.getTime();
}

// 促し通知を指定時刻に予約（毎日繰り返し）。既存の予約は置き換える。
// 予約できたかどうかを返す。
export async function schedulePromptNotification(hour, minute) {
  await ensureChannel();

  // notifee は Android 12+ で SCHEDULE_EXACT_ALARM が無いと、
  // 標準エラーに出すだけで何も予約せずに終わる（サイレント失敗）。
  // 先に確認して呼び出し側が気付けるようにする。
  let exactAllowed = true;
  try {
    exactAllowed = await canScheduleExactAlarms();
  } catch {
    // ネイティブモジュールが取れない場合は予約を試みる方に倒す
    exactAllowed = true;
  }
  if (!exactAllowed) {
    console.warn('SCHEDULE_EXACT_ALARM 未許可のため促し通知を予約できません');
    return false;
  }

  await notifee.createTriggerNotification(
    {
      id: NOTIFICATION_ID,
      title: 'GENBAAlarm',
      body: '明日のアラームがセットされていません',
      android: {
        channelId: CHANNEL_ID,
        importance: AndroidImportance.HIGH,
        autoCancel: true,
        // launchActivity を指定しないとタップしてもアプリが起動しない
        pressAction: { id: 'default', launchActivity: 'default' },
      },
    },
    {
      type: TriggerType.TIMESTAMP,
      timestamp: nextTriggerTimestamp(hour, minute),
      repeatFrequency: RepeatFrequency.DAILY,
      // allowWhileIdle は非推奨。setExactAndAllowWhileIdle + RTC_WAKEUP になる
      alarmManager: { type: AlarmType.SET_EXACT_AND_ALLOW_WHILE_IDLE },
    }
  );

  // 予約が実際に登録されたか確認する
  const pending = await notifee.getTriggerNotificationIds();
  if (!pending.includes(NOTIFICATION_ID)) {
    console.warn('促し通知の予約が登録されませんでした');
    return false;
  }
  return true;
}

// 明日のアラームの有無に応じて促し通知の予約状態を合わせる。
// 何度呼んでも安全（予約済みならそのまま残す）。
export async function syncPromptNotification() {
  if (await hasTomorrowAlarm()) {
    // cancelNotification は繰り返しトリガーごと消すので用途別に呼び分ける
    await notifee.cancelTriggerNotification(NOTIFICATION_ID);
    await notifee.cancelDisplayedNotification(NOTIFICATION_ID);
    return;
  }
  const pending = await notifee.getTriggerNotificationIds();
  if (pending.includes(NOTIFICATION_ID)) return;
  const settings = await getSettings();
  await schedulePromptNotification(settings.notifyHour, settings.notifyMinute);
}

// バックグラウンドタスク: 予約状態を実際のアラーム登録状況に追従させる
TaskManager.defineTask(TASK_NAME, async () => {
  try {
    await syncPromptNotification();
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
    await syncPromptNotification();
  } catch (e) {
    console.warn('Background task registration failed:', e);
  }
}
