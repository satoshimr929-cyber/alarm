import AsyncStorage from '@react-native-async-storage/async-storage';
import { setAlarm as nativeSetAlarm, cancelAlarm as nativeCancelAlarm, makeAlarmId } from './nativeAlarm';

const ALARMS_KEY = 'alarms';
const SITES_KEY = 'sites';

export function formatDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function parseTime(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return { hour: h, minute: m };
}

export function timestampFor(dateStr, timeStr) {
  const { hour, minute } = parseTime(timeStr);
  const [y, mo, d] = dateStr.split('-').map(Number);
  return new Date(y, mo - 1, d, hour, minute, 0, 0).getTime();
}

// ---- sites ----

export async function getSites() {
  try {
    const raw = await AsyncStorage.getItem(SITES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function saveSites(sites) {
  await AsyncStorage.setItem(SITES_KEY, JSON.stringify(sites));
}

// ---- alarms ----

export async function getAlarms() {
  try {
    const raw = await AsyncStorage.getItem(ALARMS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function saveAlarms(alarms) {
  await AsyncStorage.setItem(ALARMS_KEY, JSON.stringify(alarms));
}

async function cancelNativeIds(alarmIds) {
  for (const id of alarmIds || []) {
    await nativeCancelAlarm(id).catch(() => {});
  }
}

// 過去日のアラームを削除して残りを返す
export async function cleanupPastAlarms() {
  const alarms = await getAlarms();
  const today = formatDateKey(new Date());
  const kept = [];
  for (const a of alarms) {
    if (a.date < today) {
      await cancelNativeIds(a.alarmIds);
    } else {
      kept.push(a);
    }
  }
  if (kept.length !== alarms.length) await saveAlarms(kept);
  return kept;
}

// 1日1アラーム: 同日があれば上書き（旧ネイティブアラームはキャンセル）
export async function upsertAlarm({ date, siteName, wakeTime, extraAlarms = [], ringtoneUri = '' }) {
  const alarms = await cleanupPastAlarms();
  const existing = alarms.find((a) => a.date === date);
  if (existing) {
    await cancelNativeIds(existing.alarmIds);
  }

  const ts = timestampFor(date, wakeTime);
  if (ts <= Date.now()) {
    throw new Error('過去の日時はセットできません');
  }

  const prefix = siteName ? `${siteName} ` : '';
  const nativeId = makeAlarmId();
  await nativeSetAlarm(nativeId, ts, `${prefix}${wakeTime}`, ringtoneUri);

  const alarmIds = [nativeId];
  const enabledExtras = extraAlarms.filter((e) => e.enabled);
  for (const extra of enabledExtras) {
    const extraTs = ts + extra.offset * 60 * 1000;
    if (extraTs > Date.now()) {
      const extraId = makeAlarmId();
      const sign = extra.offset < 0 ? `${Math.abs(extra.offset)}分前` : `${extra.offset}分後`;
      await nativeSetAlarm(extraId, extraTs, `${prefix}${wakeTime}（${sign}）`, ringtoneUri);
      alarmIds.push(extraId);
    }
  }

  const entry = {
    id: `${date.replace(/-/g, '')}_${wakeTime.replace(':', '')}`,
    date,
    siteName,
    wakeTime,
    extraAlarms,
    ringtoneUri,
    alarmIds,
  };

  const next = alarms.filter((a) => a.date !== date).concat(entry)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  await saveAlarms(next);
  return entry;
}

export async function deleteAlarm(id) {
  const alarms = await getAlarms();
  const target = alarms.find((a) => a.id === id);
  if (target) {
    await cancelNativeIds(target.alarmIds);
  }
  const next = alarms.filter((a) => a.id !== id);
  await saveAlarms(next);
  return next;
}
