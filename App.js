import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  ToastAndroid,
  TouchableOpacity,
  View,
  Alert,
} from 'react-native';
import * as IntentLauncher from 'expo-intent-launcher';

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);

function showToast(msg) {
  if (Platform.OS === 'android') {
    ToastAndroid.show(msg, ToastAndroid.SHORT);
  } else {
    Alert.alert(msg);
  }
}

function DrumRoll({ items, selected, onSelect, label }) {
  return (
    <View style={styles.drumRollContainer}>
      <Text style={styles.drumRollLabel}>{label}</Text>
      <ScrollView
        style={styles.drumRoll}
        showsVerticalScrollIndicator={false}
        snapToInterval={48}
        decelerationRate="fast"
      >
        {items.map((item) => (
          <TouchableOpacity
            key={item}
            style={[styles.drumRollItem, item === selected && styles.drumRollSelected]}
            onPress={() => onSelect(item)}
          >
            <Text style={[styles.drumRollText, item === selected && styles.drumRollSelectedText]}>
              {String(item).padStart(2, '0')}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

function PendingAlarmItem({ alarm, onRemove }) {
  return (
    <View style={styles.alarmItem}>
      <Text style={styles.alarmItemTime}>
        {String(alarm.hour).padStart(2, '0')}:{String(alarm.minute).padStart(2, '0')}
      </Text>
      <TouchableOpacity onPress={onRemove} style={styles.iconButton}>
        <Text style={styles.iconButtonText}>✕</Text>
      </TouchableOpacity>
    </View>
  );
}

function SetAlarmItem({ alarm, onDelete, deleting }) {
  return (
    <View style={[styles.alarmItem, styles.setAlarmItem]}>
      <View style={styles.setAlarmLeft}>
        <Text style={styles.setAlarmBadge}>セット済</Text>
        <Text style={styles.alarmItemTime}>
          {String(alarm.hour).padStart(2, '0')}:{String(alarm.minute).padStart(2, '0')}
        </Text>
      </View>
      <TouchableOpacity
        onPress={onDelete}
        style={[styles.iconButton, deleting && styles.iconButtonDisabled]}
        disabled={deleting}
      >
        <Text style={[styles.iconButtonText, styles.deleteIconText]}>🗑</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function App() {
  const now = new Date();
  const [hour, setHour] = useState(now.getHours());
  const [minute, setMinute] = useState(now.getMinutes());
  // セット前のリスト
  const [pending, setPending] = useState([]);
  // セット済みのリスト（削除対象）
  const [setAlarms, setSetAlarms] = useState([]);
  const [setting, setSetting] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  function addToPending() {
    const duplicate =
      pending.some((a) => a.hour === hour && a.minute === minute) ||
      setAlarms.some((a) => a.hour === hour && a.minute === minute);
    if (duplicate) {
      showToast('同じ時刻は既に追加済みです');
      return;
    }
    const next = [...pending, { hour, minute, id: Date.now() }];
    next.sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute));
    setPending(next);
  }

  function removeFromPending(id) {
    setPending((prev) => prev.filter((a) => a.id !== id));
  }

  async function setAllAlarms() {
    if (Platform.OS !== 'android') {
      Alert.alert('Android専用', 'この機能はAndroidのみ対応しています。');
      return;
    }
    const targets = pending.length > 0 ? pending : [{ hour, minute, id: Date.now() }];
    setSetting(true);
    try {
      for (const alarm of targets) {
        await IntentLauncher.startActivityAsync('android.intent.action.SET_ALARM', {
          extra: {
            'android.intent.extra.alarm.HOUR': alarm.hour,
            'android.intent.extra.alarm.MINUTES': alarm.minute,
            'android.intent.extra.alarm.SKIP_UI': true,
            'android.intent.extra.alarm.MESSAGE': 'GENBAAlarm',
            'android.intent.extra.alarm.VIBRATE': true,
          },
        });
      }
      const label =
        targets.length === 1
          ? `${String(targets[0].hour).padStart(2, '0')}:${String(targets[0].minute).padStart(2, '0')} をセットしました`
          : `${targets.length}件のアラームをセットしました`;
      showToast(label);
      // セット済みリストに移動
      const next = [...setAlarms, ...targets];
      next.sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute));
      setSetAlarms(next);
      setPending([]);
    } catch (e) {
      Alert.alert('エラー', 'アラームのセットに失敗しました: ' + e.message);
    } finally {
      setSetting(false);
    }
  }

  async function deleteSetAlarm(alarm) {
    setDeletingId(alarm.id);
    try {
      await IntentLauncher.startActivityAsync('android.intent.action.DISMISS_ALARM', {
        extra: {
          // 時刻で一致するアラームを検索して削除
          'android.intent.extra.alarm.SEARCH_MODE': 'android.intent.extra.alarm.SEARCH_MODE_TIME',
          'android.intent.extra.alarm.HOUR': alarm.hour,
          'android.intent.extra.alarm.MINUTES': alarm.minute,
          'android.intent.extra.alarm.SKIP_UI': true,
        },
      });
      setSetAlarms((prev) => prev.filter((a) => a.id !== alarm.id));
      showToast(
        `${String(alarm.hour).padStart(2, '0')}:${String(alarm.minute).padStart(2, '0')} を削除しました`
      );
    } catch (e) {
      Alert.alert('削除エラー', '削除に失敗しました: ' + e.message);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <StatusBar style="dark" />
      <Text style={styles.title}>GENBAAlarm</Text>
      <Text style={styles.subtitle}>時刻を選択してください</Text>

      <View style={styles.timeDisplay}>
        <Text style={styles.timeText}>
          {String(hour).padStart(2, '0')}:{String(minute).padStart(2, '0')}
        </Text>
      </View>

      <View style={styles.pickerRow}>
        <DrumRoll items={HOURS} selected={hour} onSelect={setHour} label="時" />
        <Text style={styles.colon}>:</Text>
        <DrumRoll items={MINUTES} selected={minute} onSelect={setMinute} label="分" />
      </View>

      <TouchableOpacity style={styles.addButton} onPress={addToPending} activeOpacity={0.7}>
        <Text style={styles.addButtonText}>＋ リストに追加</Text>
      </TouchableOpacity>

      {pending.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>セット予定</Text>
          {pending.map((alarm) => (
            <PendingAlarmItem
              key={alarm.id}
              alarm={alarm}
              onRemove={() => removeFromPending(alarm.id)}
            />
          ))}
        </View>
      )}

      <TouchableOpacity
        style={[styles.button, setting && styles.buttonDisabled]}
        onPress={setAllAlarms}
        activeOpacity={0.8}
        disabled={setting}
      >
        <Text style={styles.buttonText}>
          {setting
            ? 'セット中...'
            : pending.length > 0
            ? `${pending.length}件のアラームをセット`
            : 'アラームをセット'}
        </Text>
      </TouchableOpacity>

      {setAlarms.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>
            セット済み
            <Text style={styles.sectionNote}>　※削除は機種依存</Text>
          </Text>
          {setAlarms.map((alarm) => (
            <SetAlarmItem
              key={alarm.id}
              alarm={alarm}
              onDelete={() => deleteSetAlarm(alarm)}
              deleting={deletingId === alarm.id}
            />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: '#F0F4FF',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    paddingTop: 60,
    paddingBottom: 40,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#1A1A2E',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 24,
  },
  timeDisplay: {
    backgroundColor: '#1A1A2E',
    borderRadius: 16,
    paddingHorizontal: 32,
    paddingVertical: 16,
    marginBottom: 24,
  },
  timeText: {
    fontSize: 56,
    fontWeight: 'bold',
    color: '#FFFFFF',
    letterSpacing: 4,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  colon: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#1A1A2E',
    marginHorizontal: 8,
    marginTop: -16,
  },
  drumRollContainer: {
    alignItems: 'center',
  },
  drumRollLabel: {
    fontSize: 13,
    color: '#888',
    marginBottom: 4,
  },
  drumRoll: {
    height: 192,
    width: 72,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#D0D8FF',
  },
  drumRollItem: {
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  drumRollSelected: {
    backgroundColor: '#4A6CF7',
    marginHorizontal: 4,
    borderRadius: 8,
  },
  drumRollText: {
    fontSize: 22,
    color: '#444',
    fontWeight: '500',
  },
  drumRollSelectedText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  addButton: {
    borderWidth: 2,
    borderColor: '#4A6CF7',
    borderRadius: 24,
    paddingHorizontal: 32,
    paddingVertical: 10,
    marginBottom: 16,
  },
  addButtonText: {
    color: '#4A6CF7',
    fontSize: 15,
    fontWeight: '600',
  },
  section: {
    width: '100%',
    marginBottom: 16,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#888',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  sectionNote: {
    fontSize: 11,
    fontWeight: '400',
    color: '#BBB',
  },
  alarmItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#D0D8FF',
  },
  setAlarmItem: {
    borderColor: '#B8C8FF',
    backgroundColor: '#F5F7FF',
  },
  setAlarmLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  setAlarmBadge: {
    fontSize: 10,
    color: '#4A6CF7',
    backgroundColor: '#E8ECFF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    fontWeight: '600',
  },
  alarmItemTime: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1A1A2E',
    letterSpacing: 2,
  },
  iconButton: {
    padding: 6,
  },
  iconButtonDisabled: {
    opacity: 0.3,
  },
  iconButtonText: {
    fontSize: 16,
    color: '#999',
  },
  deleteIconText: {
    fontSize: 18,
  },
  button: {
    backgroundColor: '#4A6CF7',
    paddingHorizontal: 48,
    paddingVertical: 16,
    borderRadius: 32,
    shadowColor: '#4A6CF7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
    marginBottom: 24,
  },
  buttonDisabled: {
    backgroundColor: '#AAB4E8',
    elevation: 0,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
});
