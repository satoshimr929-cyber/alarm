import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
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
import notifee from '@notifee/react-native';
import {
  setAlarm,
  cancelAlarm,
  canScheduleExactAlarms,
  openAlarmPermissionSettings,
  canUseFullScreenIntent,
  openFullScreenIntentSettings,
  makeAlarmId,
  makeLabel,
  makeTimestamp,
} from './src/nativeAlarm';
import {
  getAlarmsForDate,
  getSettings,
  saveAlarmsForDate,
  saveSettings,
  getTomorrow,
  formatDate,
} from './src/storage';
import { registerBackgroundTask, ensureChannel } from './src/backgroundTask';

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);

function showToast(msg) {
  if (Platform.OS === 'android') ToastAndroid.show(msg, ToastAndroid.SHORT);
  else Alert.alert(msg);
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
            style={[styles.drumRollItem, { height: itemHeight }, item === selected && styles.drumRollSelected]}
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
  const timeStr = makeLabel(alarm.hour, alarm.minute);
  const isTomorrow = alarm.timestamp && new Date(alarm.timestamp).getDate() !== new Date().getDate();
  return (
    <View style={styles.alarmRow}>
      {badge && <Text style={[styles.badge, { backgroundColor: badgeColor || '#4A6CF7' }]}>{badge}</Text>}
      <Text style={styles.alarmRowTime}>{timeStr}</Text>
      {isTomorrow && <Text style={styles.dayLabel}>明日</Text>}
      <TouchableOpacity onPress={onDelete} style={styles.rowDeleteBtn}>
        <Text style={styles.rowDeleteBtnText}>✕</Text>
      </TouchableOpacity>
    </View>
  );
}

function SettingsModal({ visible, notifyHour, notifyMinute, onSave, onClose }) {
  const [h, setH] = useState(notifyHour);
  const [m, setM] = useState(notifyMinute);
  useEffect(() => { setH(notifyHour); setM(notifyMinute); }, [notifyHour, notifyMinute]);
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalSheet}>
          <Text style={styles.modalTitle}>⚙ 促し通知の設定</Text>
          <Text style={styles.modalSubtitle}>
            翌日のアラームが未登録の場合、この時刻に通知を送ります
          </Text>
          <View style={styles.pickerRow}>
            <DrumRoll items={HOURS} selected={h} onSelect={setH} label="時" visibleItems={3} />
            <Text style={styles.colon}>:</Text>
            <DrumRoll items={MINUTES} selected={m} onSelect={setM} label="分" visibleItems={3} />
          </View>
          <TouchableOpacity style={styles.saveButton} onPress={() => onSave(h, m)} activeOpacity={0.8}>
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
  const [pending, setPending] = useState([]);
  const [setAlarms, setSetAlarms] = useState([]);
  const [tomorrowAlarms, setTomorrowAlarms] = useState([]);
  const [notifyHour, setNotifyHour] = useState(22);
  const [notifyMinute, setNotifyMinute] = useState(0);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [setting, setSetting] = useState(false);

  useEffect(() => {
    (async () => {
      await notifee.requestPermission();
      await ensureChannel();

      const canExact = await canScheduleExactAlarms();
      if (!canExact) {
        Alert.alert(
          'アラーム権限が必要です',
          '正確な時刻にアラームを鳴らすには「アラームと時計」の権限が必要です。',
          [{ text: '設定を開く', onPress: () => openAlarmPermissionSettings() }]
        );
      }

      const canFullScreen = await canUseFullScreenIntent();
      if (!canFullScreen) {
        Alert.alert(
          'フルスクリーン表示権限が必要です',
          'ロック画面でアラームを自動表示するには「フルスクリーンの通知を表示」の権限が必要です。',
          [{ text: '設定を開く', onPress: () => openFullScreenIntentSettings() }]
        );
      }

      const s = await getSettings();
      setNotifyHour(s.notifyHour);
      setNotifyMinute(s.notifyMinute);

      await registerBackgroundTask();

      const saved = await getAlarmsForDate(getTomorrow());
      setTomorrowAlarms(saved);
    })();
  }, []);

  function addToPending() {
    const dup = pending.some((a) => a.hour === hour && a.minute === minute) ||
      setAlarms.some((a) => a.hour === hour && a.minute === minute);
    if (dup) { showToast('同じ時刻は既にあります'); return; }
    const next = [...pending, { hour, minute, id: makeAlarmId() }].sort(
      (a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute)
    );
    setPending(next);
  }

  async function addToTomorrow() {
    const dup = tomorrowAlarms.some((a) => a.hour === hour && a.minute === minute);
    if (dup) { showToast('同じ時刻は既に登録済みです'); return; }
    const next = [...tomorrowAlarms, { hour, minute, id: makeAlarmId() }].sort(
      (a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute)
    );
    setTomorrowAlarms(next);
    await saveAlarmsForDate(getTomorrow(), next);
    showToast(`${makeLabel(hour, minute)} を明日分に登録しました`);
  }

  async function removeTomorrow(id) {
    const next = tomorrowAlarms.filter((a) => a.id !== id);
    setTomorrowAlarms(next);
    await saveAlarmsForDate(getTomorrow(), next);
  }

  async function setNow() {
    const targets = pending.length > 0 ? pending : [{ hour, minute, id: makeAlarmId() }];
    setSetting(true);
    try {
      const results = [];
      for (const alarm of targets) {
        const ts = makeTimestamp(alarm.hour, alarm.minute);
        await setAlarm(alarm.id, ts, makeLabel(alarm.hour, alarm.minute));
        results.push({ ...alarm, timestamp: ts });
      }
      const label = results.length === 1
        ? `${results[0].timestamp && new Date(results[0].timestamp).getDate() !== new Date().getDate() ? '明日' : '今日'} ${makeLabel(results[0].hour, results[0].minute)} をセットしました`
        : `${results.length}件をセットしました`;
      showToast(label);
      setSetAlarms([...setAlarms, ...results].sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute)));
      setPending([]);
    } catch (e) {
      if (e.message?.includes('PERMISSION_DENIED')) {
        Alert.alert('権限エラー', '「アラームと時計」権限を許可してください。',
          [{ text: '設定を開く', onPress: () => openAlarmPermissionSettings() }]);
      } else {
        Alert.alert('エラー', e.message);
      }
    } finally {
      setSetting(false);
    }
  }

  function deleteSetAlarm(alarm) {
    const timeStr = makeLabel(alarm.hour, alarm.minute);
    Alert.alert(`${timeStr} を削除`, 'アラームをキャンセルしますか？', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除する', style: 'destructive',
        onPress: async () => {
          await cancelAlarm(alarm.id).catch(() => {});
          setSetAlarms((prev) => prev.filter((a) => a.id !== alarm.id));
          showToast(`${timeStr} を削除しました`);
        },
      },
    ]);
  }

  async function handleSaveSettings(h, m) {
    setNotifyHour(h);
    setNotifyMinute(m);
    await saveSettings({ notifyHour: h, notifyMinute: m });
    setSettingsVisible(false);
    showToast(`促し通知を ${makeLabel(h, m)} に設定しました`);
  }

  const tomorrowDate = formatDate(getTomorrow());

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>GENBAAlarm</Text>
          <Text style={styles.subtitle}>時刻を選択してください</Text>
        </View>
        <TouchableOpacity style={styles.settingsBtn} onPress={() => setSettingsVisible(true)}>
          <Text style={styles.settingsBtnText}>⚙</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.timeDisplay}>
        <Text style={styles.timeText}>{makeLabel(hour, minute)}</Text>
      </View>

      <View style={styles.pickerRow}>
        <DrumRoll items={HOURS} selected={hour} onSelect={setHour} label="時" />
        <Text style={styles.colon}>:</Text>
        <DrumRoll items={MINUTES} selected={minute} onSelect={setMinute} label="分" />
      </View>

      <View style={styles.actionRow}>
        <TouchableOpacity style={styles.subButton} onPress={addToPending} activeOpacity={0.7}>
          <Text style={styles.subButtonText}>＋ 今すぐリストへ</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.subButtonAccent} onPress={addToTomorrow} activeOpacity={0.7}>
          <Text style={styles.subButtonAccentText}>📅 明日分に登録</Text>
        </TouchableOpacity>
      </View>

      {pending.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>今すぐセット予定</Text>
          {pending.map((a) => (
            <AlarmRow key={a.id} alarm={a} onDelete={() => setPending((p) => p.filter((x) => x.id !== a.id))} />
          ))}
        </View>
      )}

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

      {setAlarms.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>セット済み</Text>
          {setAlarms.map((a) => (
            <AlarmRow key={a.id} alarm={a} badge="済" badgeColor="#34C759" onDelete={() => deleteSetAlarm(a)} />
          ))}
        </View>
      )}

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>
            📅 明日の登録済みアラーム <Text style={styles.sectionNote}>{tomorrowDate}</Text>
          </Text>
        </View>
        {tomorrowAlarms.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>明日分が未登録です</Text>
            <Text style={styles.emptyHint}>「📅 明日分に登録」で追加してください</Text>
          </View>
        ) : (
          tomorrowAlarms.map((a) => (
            <AlarmRow key={a.id} alarm={a} badge="明日" badgeColor="#FF9F0A" onDelete={() => removeTomorrow(a.id)} />
          ))
        )}
        <Text style={styles.autoSetDescription}>
          毎日 {makeLabel(notifyHour, notifyMinute)} に未登録の場合のみ通知が届きます
        </Text>
      </View>

      <SettingsModal
        visible={settingsVisible}
        notifyHour={notifyHour}
        notifyMinute={notifyMinute}
        onSave={handleSaveSettings}
        onClose={() => setSettingsVisible(false)}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: '#F0F4FF', alignItems: 'center', padding: 24, paddingTop: 56, paddingBottom: 48 },
  header: { width: '100%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  title: { fontSize: 28, fontWeight: 'bold', color: '#1A1A2E' },
  subtitle: { fontSize: 13, color: '#666', marginTop: 2 },
  settingsBtn: { padding: 8, backgroundColor: '#E8ECFF', borderRadius: 20, width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  settingsBtnText: { fontSize: 20 },
  timeDisplay: { backgroundColor: '#1A1A2E', borderRadius: 16, paddingHorizontal: 32, paddingVertical: 14, marginBottom: 20 },
  timeText: { fontSize: 52, fontWeight: 'bold', color: '#FFFFFF', letterSpacing: 4 },
  pickerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  colon: { fontSize: 28, fontWeight: 'bold', color: '#1A1A2E', marginHorizontal: 8, marginTop: -14 },
  drumRollContainer: { alignItems: 'center' },
  drumRollLabel: { fontSize: 12, color: '#888', marginBottom: 4 },
  drumRoll: { width: 72, backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 2, borderColor: '#D0D8FF' },
  drumRollItem: { alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  drumRollSelected: { backgroundColor: '#4A6CF7', marginHorizontal: 4, borderRadius: 8 },
  drumRollText: { fontSize: 21, color: '#444', fontWeight: '500' },
  drumRollSelectedText: { color: '#FFFFFF', fontWeight: 'bold' },
  actionRow: { flexDirection: 'row', gap: 10, marginBottom: 16, width: '100%' },
  subButton: { flex: 1, borderWidth: 2, borderColor: '#4A6CF7', borderRadius: 24, paddingVertical: 10, alignItems: 'center' },
  subButtonText: { color: '#4A6CF7', fontSize: 14, fontWeight: '600' },
  subButtonAccent: { flex: 1, borderWidth: 2, borderColor: '#FF9F0A', borderRadius: 24, paddingVertical: 10, alignItems: 'center', backgroundColor: '#FFF8EC' },
  subButtonAccentText: { color: '#CC7A00', fontSize: 14, fontWeight: '600' },
  section: { width: '100%', marginBottom: 16 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: '#888', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 },
  sectionNote: { fontSize: 10, fontWeight: '400', color: '#BBB' },
  alarmRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10, marginBottom: 8, borderWidth: 1, borderColor: '#D0D8FF', gap: 10 },
  badge: { fontSize: 10, color: '#FFF', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, fontWeight: '700', overflow: 'hidden' },
  alarmRowTime: { flex: 1, fontSize: 20, fontWeight: 'bold', color: '#1A1A2E', letterSpacing: 2 },
  dayLabel: { fontSize: 11, color: '#FF9F0A', fontWeight: '600' },
  rowDeleteBtn: { padding: 4 },
  rowDeleteBtnText: { fontSize: 15, color: '#999' },
  primaryButton: { width: '100%', backgroundColor: '#4A6CF7', paddingVertical: 16, borderRadius: 32, alignItems: 'center', shadowColor: '#4A6CF7', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 6, marginBottom: 20 },
  primaryButtonDisabled: { backgroundColor: '#AAB4E8', elevation: 0 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 17, fontWeight: 'bold' },
  emptyBox: { backgroundColor: '#F8F9FF', borderRadius: 12, paddingVertical: 16, paddingHorizontal: 20, alignItems: 'center', borderWidth: 1, borderColor: '#E0E4F8', borderStyle: 'dashed', marginBottom: 8 },
  emptyText: { color: '#AAA', fontSize: 14, fontWeight: '500' },
  emptyHint: { color: '#CCC', fontSize: 11, marginTop: 4 },
  autoSetDescription: { fontSize: 11, color: '#AAA', textAlign: 'center', lineHeight: 16, marginTop: 4 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 28, paddingBottom: 40, alignItems: 'center' },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#1A1A2E', marginBottom: 6 },
  modalSubtitle: { fontSize: 13, color: '#888', marginBottom: 24, textAlign: 'center' },
  saveButton: { width: '100%', backgroundColor: '#4A6CF7', paddingVertical: 14, borderRadius: 28, alignItems: 'center', marginBottom: 12 },
  saveButtonText: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
  cancelLink: { padding: 8 },
  cancelLinkText: { color: '#999', fontSize: 14 },
});
