import AsyncStorage from '@react-native-async-storage/async-storage';

const SETTINGS_KEY = 'genba_settings';
const NOTIFICATION_ID_KEY = 'genba_notification_id';

export function formatDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function getTomorrow() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d;
}

export async function getAlarmsForDate(date) {
  try {
    const raw = await AsyncStorage.getItem(`genba_alarms_${formatDate(date)}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function saveAlarmsForDate(date, alarms) {
  await AsyncStorage.setItem(`genba_alarms_${formatDate(date)}`, JSON.stringify(alarms));
}

export async function removeAlarmsForDate(date) {
  await AsyncStorage.removeItem(`genba_alarms_${formatDate(date)}`);
}

const EXTRA_OFFSETS = [-30, -25, -20, -15, -10, -5, 5, 10, 15, 20, 25, 30];

export function defaultExtraAlarms() {
  return EXTRA_OFFSETS.map((offset) => ({ offset, enabled: false }));
}

export async function getSettings() {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return {
      notifyHour: parsed.notifyHour ?? parsed.autoSetHour ?? 22,
      notifyMinute: parsed.notifyMinute ?? parsed.autoSetMinute ?? 0,
      extraAlarms: parsed.extraAlarms ?? defaultExtraAlarms(),
    };
  } catch {
    return { notifyHour: 22, notifyMinute: 0, extraAlarms: defaultExtraAlarms() };
  }
}

export async function saveSettings(settings) {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export async function getSavedNotificationId() {
  return AsyncStorage.getItem(NOTIFICATION_ID_KEY);
}

export async function setSavedNotificationId(id) {
  if (id) {
    await AsyncStorage.setItem(NOTIFICATION_ID_KEY, id);
  } else {
    await AsyncStorage.removeItem(NOTIFICATION_ID_KEY);
  }
}
