import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
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

export default function App() {
  const now = new Date();
  const [hour, setHour] = useState(now.getHours());
  const [minute, setMinute] = useState(now.getMinutes());

  async function setAlarm() {
    if (Platform.OS !== 'android') {
      Alert.alert('Android専用', 'この機能はAndroidのみ対応しています。');
      return;
    }
    try {
      await IntentLauncher.startActivityAsync('android.intent.action.SET_ALARM', {
        extra: {
          'android.intent.extra.alarm.HOUR': hour,
          'android.intent.extra.alarm.MINUTES': minute,
          'android.intent.extra.alarm.SKIP_UI': false,
          'android.intent.extra.alarm.MESSAGE': 'GENBAAlarm',
        },
      });
    } catch (e) {
      Alert.alert('エラー', 'アラームのセットに失敗しました: ' + e.message);
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

      <TouchableOpacity style={styles.button} onPress={setAlarm} activeOpacity={0.8}>
        <Text style={styles.buttonText}>アラームをセット</Text>
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
    marginBottom: 40,
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
  buttonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
});
