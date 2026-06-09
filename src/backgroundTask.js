import AsyncStorage from '@react-native-async-storage/async-storage';
import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import notifee, { AndroidImportance } from '@notifee/react-native';
import { getAlarmsForDate, getTomorrow, getSettings } from './storage';

export const TASK_NAME = 'GENBA_ALARM_BACKGROUND_CHECK';
export const CHANNEL_ID = 'genba_alarm';

const LAST_PROMPT_DATE_KEY = 'genba_last_prompt_date';

export async function ensureChannel() {
  await notifee.createChannel({
    id: CHANNEL_ID,
    name: 'GENBAAlarm',
    importance: AndroidImportance.HIGH,
    sound: 'default',
  });
}

TaskManager.defineTask(TASK_NAME, async () => {
  try {
    const settings = await getSettings();
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const targetMinutes = settings.notifyHour * 60 + settings.notifyMinute;

    if (Math.abs(currentMinutes - targetMinutes) > 15) {
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    // 今日すでに送った場合はスキップ
    const today = now.toDateString();
    const lastDate = await AsyncStorage.getItem(LAST_PROMPT_DATE_KEY);
    if (lastDate === today) {
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    const alarms = await getAlarmsForDate(getTomorrow());
    await AsyncStorage.setItem(LAST_PROMPT_DATE_KEY, today);

    if (alarms.length > 0) {
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    await ensureChannel();
    await notifee.displayNotification({
      title: 'GENBAAlarm',
      body: '明日のアラームがセットされていません',
      android: {
        channelId: CHANNEL_ID,
        importance: AndroidImportance.HIGH,
        pressAction: { id: 'default' },
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
