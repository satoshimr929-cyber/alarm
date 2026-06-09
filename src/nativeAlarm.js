import { NativeModules, Platform } from 'react-native';

const { GENBAAlarmManager } = NativeModules;

function pad(n) {
  return String(n).padStart(2, '0');
}

export function makeAlarmId() {
  return Math.floor(Date.now() % 2147483647);
}

export function makeLabel(hour, minute) {
  return `${pad(hour)}:${pad(minute)}`;
}

export function makeTimestamp(hour, minute) {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  if (d <= new Date()) d.setDate(d.getDate() + 1);
  return d.getTime();
}

export async function setAlarm(id, timestamp, label) {
  if (Platform.OS !== 'android') throw new Error('Android only');
  return GENBAAlarmManager.setAlarm(id, timestamp, label);
}

export async function cancelAlarm(id) {
  if (Platform.OS !== 'android') return;
  return GENBAAlarmManager.cancelAlarm(id);
}

export async function getScheduledAlarms() {
  if (Platform.OS !== 'android') return [];
  return GENBAAlarmManager.getScheduledAlarms();
}

export async function canScheduleExactAlarms() {
  if (Platform.OS !== 'android') return true;
  return GENBAAlarmManager.canScheduleExactAlarms();
}

export async function openAlarmPermissionSettings() {
  if (Platform.OS !== 'android') return;
  return GENBAAlarmManager.openAlarmPermissionSettings();
}

export async function canUseFullScreenIntent() {
  if (Platform.OS !== 'android') return true;
  return GENBAAlarmManager.canUseFullScreenIntent();
}

export async function openFullScreenIntentSettings() {
  if (Platform.OS !== 'android') return;
  return GENBAAlarmManager.openFullScreenIntentSettings();
}
