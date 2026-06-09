import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  ToastAndroid,
  TouchableOpacity,
  View,
} from 'react-native';
import * as IntentLauncher from 'expo-intent-launcher';
import notifee, { EventType } from '@notifee/react-native';
import {
  getAlarmsForDate,
  getSettings,
  saveAlarmsForDate,
  saveSettings,
  getTomorrow,
  formatDate,
} from './src/storage';
import {
  registerBackgroundTask,
  scheduleAutoNotification,
  ensureChannel,
} from './src/backgroundTask';

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);

function showToast(msg) {
  if (Platform.OS === 'android') {
    ToastAndroid.show(msg, ToastAndroid.SHORT);
  } else {
    Alert.alert(msg);
  }
}

function DrumRoll({ items, selected, onSelect, label, itemHeight = 48, visibleItems = 4 }) {
  return (
    <View style={styles.drumRollContainer}>
      <Text style={styles.drumRollLabel}>{label}</Text>
      <ScrollView
        style={[styles.drumRoll, { height: itemHeight * visibleItems }]}
        showsVerticalScrollIndicator={false}
        snapToInterval={itemHeight}
        decelerationRate="fast"
        nestedScrollEnabled={true}
      >
        {items.map((item) => (
          <TouchableOpacity
            key={item}
            style={[
              styles.drumRollItem,
              { height: itemHeight },
              item === selected && styles.drumRollSelected,
            ]}
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

function AlarmRow({ alarm, onDelete, badge, badgeColor }) {
  const timeStr = `${String(alarm.hour).padStart(2, '0')}:${String(alarm.minute).padStart(2, '0')}`;
  return (
    <View style={styles.alarmRow}>
      {badge && (
        <Text style={[styles.badge, { backgroundColor: badgeColor || '#4A6CF7' }]}>{badge}</Text>
      )}
      <Text style={styles.alarmRowTime}>{timeStr}</Text>
      <TouchableOpacity onPress={onDelete} style={styles.rowDeleteBtn}>
        <Text style={styles.rowDeleteBtnText}>✕</Text>
      </TouchableOpacity>
    </View>
  );
}

// 設定モーダル
function SettingsModal({ visible, autoSetHour, autoSetMinute, onSave, onClose }) {
  const [h, setH] = useState(autoSetHour);
  const [m, setM] = useState(autoSetMinute);

  useEffect(() => {
    setH(autoSetHour);
    setM(autoSetMinute);
  }, [autoSetHour, autoSetMinute]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalSheet}>
          <Text style={styles.modalTitle}>⚙ 自動セット設定</Text>
          <Text style={styles.modalSubtitle}>毎日この時刻に自動処理を実行します</Text>

          <View style={styles.pickerRow}>
            <DrumRoll items={HOURS} selected={h} onSelect={setH} label="時" visibleItems={3} />
            <Text style={styles.colon}>:</Text>
            <DrumRoll items={MINUTES} selected={m} onSelect={setM} label="分" visibleItems={3} />
          </View>

          <View style={styles.modalNote}>
            <Text style={styles.modalNoteText}>
              ⚠ バックグラウンドタスクは最小15分間隔で動作します。{'\n'}
              通知タップでアプリが起動しアラームを自動セットします。
            </Text>
          </View>

          <TouchableOpacity
            style={styles.saveButton}
            onPress={() => onSave(h, m)}
            activeOpacity={0.8}
          >
            <Text style={styles.saveButtonText}>保存して閉じる</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.cancelLink} onPress={onClose}>
            <Text style={styles.cancelLinkText}>キャンセル</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

export default function App() {
  const now = new Date();
  const [hour, setHour] = useState(now.getHours());
  const [minute, setMinute] = useState(now.getMinutes());

  // 即時セット用の pending リスト
  const [pending, setPending] = useState([]);
  // セット済みリスト（今日）
  const [setAlarms, setSetAlarms] = useState([]);
  // 明日分として保存した自動セット予定リスト
  const [tomorrowAlarms, setTomorrowAlarms] = useState([]);

  const [autoSetHour, setAutoSetHour] = useState(22);
  const [autoSetMinute, setAutoSetMinute] = useState(0);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [setting, setSetting] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  // 初期化
  useEffect(() => {
    (async () => {
      // 通知権限リクエスト
      const settings = await notifee.requestPermission();
      if (!settings.authorizationStatus) {
        Alert.alert(
          '通知権限',
          'バックグラウンド自動チェックには通知の許可が必要です。設定から許可してください。'
        );
      }

      // チャンネル作成（ALARM カテゴリ、bypassDnd、HIGH）
      await ensureChannel();

      // 設定ロード
      const s = await getSettings();
      setAutoSetHour(s.autoSetHour);
      setAutoSetMinute(s.autoSetMinute);

      // バックグラウンドタスク登録
      await registerBackgroundTask();

      // フォールバック用: 毎日定時通知をスケジュール
      await scheduleAutoNotification(s.autoSetHour, s.autoSetMinute);

      // 明日分の保存済みアラームをロード
      const saved = await getAlarmsForDate(getTomorrow());
      setTomorrowAlarms(saved);
    })();

    // フォアグラウンド中の通知イベント
    const unsubscribe = notifee.onForegroundEvent(({ type, detail }) => {
      if (type === EventType.PRESS) {
        const action = detail.notification?.data?.action;
        if (action === 'auto_set' || action === 'daily_check') {
          handleAutoSetFromNotification();
        }
      }
    });

    return unsubscribe;
  }, []);

  // 通知タップ時: 明日分アラームを自動セット
  async function handleAutoSetFromNotification() {
    if (Platform.OS !== 'android') return;
    const tomorrow = getTomorrow();
    const alarms = await getAlarmsForDate(tomorrow);
    if (alarms.length === 0) {
      showToast('明日のアラームが登録されていません');
      return;
    }
    try {
      for (const alarm of alarms) {
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
        alarms.length === 1
          ? `${String(alarms[0].hour).padStart(2, '0')}:${String(alarms[0].minute).padStart(2, '0')} を自動セットしました`
          : `${alarms.length}件のアラームを自動セットしました`;
      showToast(label);
    } catch (e) {
      Alert.alert('自動セットエラー', e.message);
    }
  }

  // 即時セット用リストに追加
  function addToPending() {
    const dup =
      pending.some((a) => a.hour === hour && a.minute === minute) ||
      setAlarms.some((a) => a.hour === hour && a.minute === minute);
    if (dup) {
      showToast('同じ時刻は既にあります');
      return;
    }
    const next = [...pending, { hour, minute, id: Date.now() }].sort(
      (a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute)
    );
    setPending(next);
  }

  // 明日分の自動セット予定に追加（AsyncStorage保存）
  async function addToTomorrow() {
    const dup = tomorrowAlarms.some((a) => a.hour === hour && a.minute === minute);
    if (dup) {
      showToast('同じ時刻は既に登録済みです');
      return;
    }
    const next = [...tomorrowAlarms, { hour, minute, id: Date.now() }].sort(
      (a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute)
    );
    setTomorrowAlarms(next);
    await saveAlarmsForDate(getTomorrow(), next);
    showToast(`${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')} を明日分に登録しました`);
  }

  // 明日分から削除
  async function removeTomorrow(id) {
    const next = tomorrowAlarms.filter((a) => a.id !== id);
    setTomorrowAlarms(next);
    await saveAlarmsForDate(getTomorrow(), next);
  }

  // 今すぐセット
  async function setNow() {
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
          : `${targets.length}件をセットしました`;
      showToast(label);
      const next = [...setAlarms, ...targets].sort(
        (a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute)
      );
      setSetAlarms(next);
      setPending([]);
    } catch (e) {
      Alert.alert('エラー', e.message);
    } finally {
      setSetting(false);
    }
  }

  // セット済みを削除（リストから削除 + notifee キャンセル）
  async function deleteSetAlarm(alarm) {
    setDeletingId(alarm.id);
    try {
      if (alarm.notifeeId) {
        await notifee.cancelTriggerNotification(alarm.notifeeId).catch(() => {});
      }
      setSetAlarms((prev) => prev.filter((a) => a.id !== alarm.id));
      showToast(
        `${String(alarm.hour).padStart(2, '0')}:${String(alarm.minute).padStart(2, '0')} を削除しました`
      );
    } catch (e) {
      Alert.alert('削除エラー', e.message);
    } finally {
      setDeletingId(null);
    }
  }

  // 設定保存
  async function handleSaveSettings(h, m) {
    setAutoSetHour(h);
    setAutoSetMinute(m);
    await saveSettings({ autoSetHour: h, autoSetMinute: m });
    await scheduleAutoNotification(h, m);
    setSettingsVisible(false);
    showToast(`自動チェック時刻を ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} に設定しました`);
  }

  const tomorrowDate = formatDate(getTomorrow());

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <StatusBar style="dark" />

      {/* ヘッダー */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>GENBAAlarm</Text>
          <Text style={styles.subtitle}>時刻を選択してください</Text>
        </View>
        <TouchableOpacity style={styles.settingsBtn} onPress={() => setSettingsVisible(true)}>
          <Text style={styles.settingsBtnText}>⚙</Text>
        </TouchableOpacity>
      </View>

      {/* 時刻表示 */}
      <View style={styles.timeDisplay}>
        <Text style={styles.timeText}>
          {String(hour).padStart(2, '0')}:{String(minute).padStart(2, '0')}
        </Text>
      </View>

      {/* ドラムロール */}
      <View style={styles.pickerRow}>
        <DrumRoll items={HOURS} selected={hour} onSelect={setHour} label="時" />
        <Text style={styles.colon}>:</Text>
        <DrumRoll items={MINUTES} selected={minute} onSelect={setMinute} label="分" />
      </View>

      {/* アクションボタン */}
      <View style={styles.actionRow}>
        <TouchableOpacity style={styles.subButton} onPress={addToPending} activeOpacity={0.7}>
          <Text style={styles.subButtonText}>＋ 今すぐリストへ</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.subButtonAccent} onPress={addToTomorrow} activeOpacity={0.7}>
          <Text style={styles.subButtonAccentText}>📅 明日分に登録</Text>
        </TouchableOpacity>
      </View>

      {/* 即時セット予定 */}
      {pending.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>今すぐセット予定</Text>
          {pending.map((a) => (
            <AlarmRow key={a.id} alarm={a} onDelete={() => setPending((p) => p.filter((x) => x.id !== a.id))} />
          ))}
        </View>
      )}

      {/* 今すぐセットボタン */}
      <TouchableOpacity
        style={[styles.primaryButton, setting && styles.primaryButtonDisabled]}
        onPress={setNow}
        disabled={setting}
        activeOpacity={0.8}
      >
        <Text style={styles.primaryButtonText}>
          {setting ? 'セット中...' : pending.length > 0 ? `${pending.length}件を今すぐセット` : '今すぐセット'}
        </Text>
      </TouchableOpacity>

      {/* セット済みリスト */}
      {setAlarms.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>セット済み</Text>
          {setAlarms.map((a) => (
            <AlarmRow
              key={a.id}
              alarm={a}
              badge="済"
              badgeColor="#34C759"
              onDelete={() => deleteSetAlarm(a)}
            />
          ))}
        </View>
      )}

      {/* 明日の自動セット予定 */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>
            📅 明日の自動セット予定{' '}
            <Text style={styles.sectionNote}>{tomorrowDate}</Text>
          </Text>
          <Text style={styles.autoSetInfo}>
            実行: {String(autoSetHour).padStart(2, '0')}:{String(autoSetMinute).padStart(2, '0')}
          </Text>
        </View>
        {tomorrowAlarms.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>明日分が未登録です</Text>
            <Text style={styles.emptyHint}>「📅 明日分に登録」で追加してください</Text>
          </View>
        ) : (
          tomorrowAlarms.map((a) => (
            <AlarmRow
              key={a.id}
              alarm={a}
              badge="自動"
              badgeColor="#FF9F0A"
              onDelete={() => removeTomorrow(a.id)}
            />
          ))
        )}
        <Text style={styles.autoSetDescription}>
          毎日 {String(autoSetHour).padStart(2, '0')}:{String(autoSetMinute).padStart(2, '0')}{' '}
          に通知が届きます。タップするとアラームが自動セットされます。
        </Text>
      </View>

      {/* 設定モーダル */}
      <SettingsModal
        visible={settingsVisible}
        autoSetHour={autoSetHour}
        autoSetMinute={autoSetMinute}
        onSave={handleSaveSettings}
        onClose={() => setSettingsVisible(false)}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: '#F0F4FF',
    alignItems: 'center',
    padding: 24,
    paddingTop: 56,
    paddingBottom: 48,
  },
  header: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1A1A2E',
  },
  subtitle: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  settingsBtn: {
    padding: 8,
    backgroundColor: '#E8ECFF',
    borderRadius: 20,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsBtnText: {
    fontSize: 20,
  },
  timeDisplay: {
    backgroundColor: '#1A1A2E',
    borderRadius: 16,
    paddingHorizontal: 32,
    paddingVertical: 14,
    marginBottom: 20,
  },
  timeText: {
    fontSize: 52,
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
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1A1A2E',
    marginHorizontal: 8,
    marginTop: -14,
  },
  drumRollContainer: {
    alignItems: 'center',
  },
  drumRollLabel: {
    fontSize: 12,
    color: '#888',
    marginBottom: 4,
  },
  drumRoll: {
    width: 72,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#D0D8FF',
  },
  drumRollItem: {
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
    fontSize: 21,
    color: '#444',
    fontWeight: '500',
  },
  drumRollSelectedText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
    width: '100%',
  },
  subButton: {
    flex: 1,
    borderWidth: 2,
    borderColor: '#4A6CF7',
    borderRadius: 24,
    paddingVertical: 10,
    alignItems: 'center',
  },
  subButtonText: {
    color: '#4A6CF7',
    fontSize: 14,
    fontWeight: '600',
  },
  subButtonAccent: {
    flex: 1,
    borderWidth: 2,
    borderColor: '#FF9F0A',
    borderRadius: 24,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#FFF8EC',
  },
  subButtonAccentText: {
    color: '#CC7A00',
    fontSize: 14,
    fontWeight: '600',
  },
  section: {
    width: '100%',
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  sectionNote: {
    fontSize: 10,
    fontWeight: '400',
    color: '#BBB',
  },
  autoSetInfo: {
    fontSize: 12,
    color: '#4A6CF7',
    fontWeight: '600',
  },
  alarmRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#D0D8FF',
    gap: 10,
  },
  badge: {
    fontSize: 10,
    color: '#FFF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    fontWeight: '700',
    overflow: 'hidden',
  },
  alarmRowTime: {
    flex: 1,
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1A1A2E',
    letterSpacing: 2,
  },
  rowDeleteBtn: {
    padding: 4,
  },
  rowDeleteBtnText: {
    fontSize: 15,
    color: '#999',
  },
  primaryButton: {
    width: '100%',
    backgroundColor: '#4A6CF7',
    paddingVertical: 16,
    borderRadius: 32,
    alignItems: 'center',
    shadowColor: '#4A6CF7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
    marginBottom: 20,
  },
  primaryButtonDisabled: {
    backgroundColor: '#AAB4E8',
    elevation: 0,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: 'bold',
  },
  emptyBox: {
    backgroundColor: '#F8F9FF',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E0E4F8',
    borderStyle: 'dashed',
    marginBottom: 8,
  },
  emptyText: {
    color: '#AAA',
    fontSize: 14,
    fontWeight: '500',
  },
  emptyHint: {
    color: '#CCC',
    fontSize: 11,
    marginTop: 4,
  },
  autoSetDescription: {
    fontSize: 11,
    color: '#AAA',
    textAlign: 'center',
    lineHeight: 16,
    marginTop: 4,
  },
  // Settings Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 28,
    paddingBottom: 40,
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1A1A2E',
    marginBottom: 6,
  },
  modalSubtitle: {
    fontSize: 13,
    color: '#888',
    marginBottom: 24,
  },
  modalNote: {
    backgroundColor: '#FFF8EC',
    borderRadius: 10,
    padding: 14,
    width: '100%',
    marginTop: 8,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#FFE4A0',
  },
  modalNoteText: {
    fontSize: 12,
    color: '#AA7700',
    lineHeight: 18,
  },
  saveButton: {
    width: '100%',
    backgroundColor: '#4A6CF7',
    paddingVertical: 14,
    borderRadius: 28,
    alignItems: 'center',
    marginBottom: 12,
  },
  saveButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  cancelLink: {
    padding: 8,
  },
  cancelLinkText: {
    color: '#999',
    fontSize: 14,
  },
});
