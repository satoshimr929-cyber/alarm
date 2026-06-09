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

function AlarmListItem({ alarm, onDelete }) {
  return (
    <View style={styles.alarmItem}>
      <Text style={styles.alarmItemTime}>
        {String(alarm.hour).padStart(2, '0')}:{String(alarm.minute).padStart(2, '0')}
      </Text>
      <TouchableOpacity onPress={onDelete} style={styles.deleteButton}>
        <Text style={styles.deleteButtonText}>✕</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function App() {
  const now = new Date();
  const [hour, setHour] = useState(now.getHours());
  const [minute, setMinute] = useState(now.getMinutes());
  const [alarms, setAlarms] = useState([]);
  const [setting, setSetting] = useState(false);

  function addAlarm() {
    const duplicate = alarms.some((a) => a.hour === hour && a.minute === minute);
    if (duplicate) {
      showToast('同じ時刻は追加済みです');
      return;
    }
    const next = [...alarms, { hour, minute, id: Date.now() }];
    next.sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute));
    setAlarms(next);
  }

  function removeAlarm(id) {
    setAlarms((prev) => prev.filter((a) => a.id !== id));
  }

  function showToast(msg) {
    if (Platform.OS === 'android') {
      ToastAndroid.show(msg, ToastAndroid.SHORT);
    } else {
      Alert.alert(msg);
    }
  }

  async function setAllAlarms() {
    if (Platform.OS !== 'android') {
      Alert.alert('Android専用', 'この機能はAndroidのみ対応しています。');
      return;
    }
    const targets = alarms.length > 0 ? alarms : [{ hour, minute }];
    setSetting(true);
    try {
      for (const alarm of targets) {
        await IntentLauncher.startActivityAsync('android.intent.action.SET_ALARM', {
          extra: {
            'android.intent.extra.alarm.HOUR': alarm.hour,
            'android.intent.extra.alarm.MINUTES': alarm.minute,
            // SKIP_UI=true でアラームアプリのUIを開かずにバックグラウンドでセット
            // 一部機種では無視される場合があるが、これが標準intentで可能な最善策
            'android.intent.extra.alarm.SKIP_UI': true,
            'android.intent.extra.alarm.MESSAGE': 'GENBAAlarm',
            'android.intent.extra.alarm.VIBRATE': true,
          },
        });
      }
      const label =
        targets.length === 1
          ? `${String(targets[0].hour).padStart(2, '0')}:${String(targets[0].minute).padStart(2, '0')} にアラームをセットしました`
          : `${targets.length}件のアラームをセットしました`;
      showToast(label);
      setAlarms([]);
    } catch (e) {
      Alert.alert('エラー', 'アラームのセットに失敗しました: ' + e.message);
    } finally {
      setSetting(false);
    }
  }

  return (
    <View style={styles.container}>
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

      <TouchableOpacity style={styles.addButton} onPress={addAlarm} activeOpacity={0.7}>
        <Text style={styles.addButtonText}>＋ リストに追加</Text>
      </TouchableOpacity>

      {alarms.length > 0 && (
        <View style={styles.alarmList}>
          {alarms.map((alarm) => (
            <AlarmListItem key={alarm.id} alarm={alarm} onDelete={() => removeAlarm(alarm.id)} />
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
            : alarms.length > 0
            ? `${alarms.length}件のアラームをセット`
            : 'アラームをセット'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F0F4FF',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
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
  alarmList: {
    width: '100%',
    marginBottom: 16,
    maxHeight: 160,
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
  alarmItemTime: {
    flex: 1,
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1A1A2E',
    letterSpacing: 2,
  },
  deleteButton: {
    padding: 4,
  },
  deleteButtonText: {
    fontSize: 16,
    color: '#999',
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
