import { useCallback, useState } from 'react';
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
import { useFocusEffect } from '@react-navigation/native';
import notifee from '@notifee/react-native';
import {
  canScheduleExactAlarms,
  openAlarmPermissionSettings,
  canUseFullScreenIntent,
  openFullScreenIntentSettings,
} from '../nativeAlarm';
import {
  getSites,
  getAlarms,
  cleanupPastAlarms,
  upsertAlarm,
  deleteAlarm,
  formatDateKey,
  parseTime,
} from '../alarmData';
import { registerBackgroundTask, ensureChannel } from '../backgroundTask';
import { colors } from '../theme';

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);
const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

function showToast(msg) {
  if (Platform.OS === 'android') ToastAndroid.show(msg, ToastAndroid.SHORT);
  else Alert.alert(msg);
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function nextDays(count) {
  const days = [];
  for (let i = 0; i < count; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    days.push(d);
  }
  return days;
}

function dateLabel(d) {
  const today = new Date();
  const diff = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) -
    new Date(today.getFullYear(), today.getMonth(), today.getDate())) / 86400000);
  const base = `${d.getMonth() + 1}/${d.getDate()}（${WEEKDAYS[d.getDay()]}）`;
  if (diff === 0) return `今日 ${base}`;
  if (diff === 1) return `明日 ${base}`;
  return base;
}

function DrumRoll({ items, selected, onSelect, label, itemHeight = 44, visibleItems = 3 }) {
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
              {pad(item)}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

function PickerModal({ visible, title, children, onClose }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={onClose}>
        <View style={styles.modalSheet}>
          <Text style={styles.modalTitle}>{title}</Text>
          {children}
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

export default function HomeScreen() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  const [sites, setSites] = useState([]);
  const [selectedSite, setSelectedSite] = useState(null);
  const [date, setDate] = useState(tomorrow);
  const [hour, setHour] = useState(5);
  const [minute, setMinute] = useState(0);
  const [alarms, setAlarms] = useState([]);
  const [siteModalVisible, setSiteModalVisible] = useState(false);
  const [dateModalVisible, setDateModalVisible] = useState(false);
  const [setting, setSetting] = useState(false);
  const [initialized, setInitialized] = useState(false);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        if (!initialized) {
          setInitialized(true);
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
          await registerBackgroundTask();
        }
        setSites(await getSites());
        setAlarms(await cleanupPastAlarms());
      })();
    }, [initialized])
  );

  function selectSite(site) {
    setSelectedSite(site);
    if (site?.defaultWakeTime) {
      const { hour: h, minute: m } = parseTime(site.defaultWakeTime);
      setHour(h);
      setMinute(m);
    }
    setSiteModalVisible(false);
  }

  async function handleSet() {
    setSetting(true);
    try {
      const dateStr = formatDateKey(date);
      const wakeTime = `${pad(hour)}:${pad(minute)}`;
      const overwritten = alarms.some((a) => a.date === dateStr);
      await upsertAlarm({
        date: dateStr,
        siteName: selectedSite?.name || '',
        wakeTime,
      });
      setAlarms(await getAlarms());
      showToast(overwritten ? `${dateLabel(date)} ${wakeTime} に上書きしました` : `${dateLabel(date)} ${wakeTime} をセットしました`);
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

  function handleDelete(alarm) {
    Alert.alert(`${alarm.wakeTime} を削除`, `${alarm.date} のアラームを削除しますか？`, [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除する', style: 'destructive',
        onPress: async () => {
          setAlarms(await deleteAlarm(alarm.id));
          showToast('削除しました');
        },
      },
    ]);
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      {/* 現場選択 */}
      <Text style={styles.fieldLabel}>現場</Text>
      <TouchableOpacity style={styles.selectBox} onPress={() => setSiteModalVisible(true)}>
        <Text style={[styles.selectBoxText, !selectedSite && styles.selectBoxPlaceholder]}>
          {selectedSite ? selectedSite.name : '現場を選択（任意）'}
        </Text>
        <Text style={styles.selectBoxArrow}>▼</Text>
      </TouchableOpacity>

      {/* 日付選択 */}
      <Text style={styles.fieldLabel}>日付</Text>
      <TouchableOpacity style={styles.selectBox} onPress={() => setDateModalVisible(true)}>
        <Text style={styles.selectBoxText}>{dateLabel(date)}</Text>
        <Text style={styles.selectBoxArrow}>▼</Text>
      </TouchableOpacity>

      {/* 時刻 */}
      <Text style={styles.fieldLabel}>起床時刻</Text>
      <View style={styles.timeDisplay}>
        <Text style={styles.timeText}>{pad(hour)}:{pad(minute)}</Text>
      </View>
      <View style={styles.pickerRow}>
        <DrumRoll items={HOURS} selected={hour} onSelect={setHour} label="時" />
        <Text style={styles.colon}>:</Text>
        <DrumRoll items={MINUTES} selected={minute} onSelect={setMinute} label="分" />
      </View>

      <TouchableOpacity
        style={[styles.primaryButton, setting && styles.primaryButtonDisabled]}
        onPress={handleSet}
        disabled={setting}
        activeOpacity={0.8}
      >
        <Text style={styles.primaryButtonText}>{setting ? 'セット中...' : '⏰ アラームをセット'}</Text>
      </TouchableOpacity>

      {/* 登録済み */}
      {alarms.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>登録済みアラーム</Text>
          {alarms.map((a) => (
            <View key={a.id} style={styles.alarmRow}>
              <View style={styles.alarmRowMain}>
                <Text style={styles.alarmRowDate}>{a.date}</Text>
                <Text style={styles.alarmRowTime}>{a.wakeTime}</Text>
                {!!a.siteName && <Text style={styles.alarmRowSite}>{a.siteName}</Text>}
              </View>
              <TouchableOpacity onPress={() => handleDelete(a)} style={styles.rowDeleteBtn}>
                <Text style={styles.rowDeleteBtnText}>🗑</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {/* 現場選択モーダル */}
      <PickerModal visible={siteModalVisible} title="現場を選択" onClose={() => setSiteModalVisible(false)}>
        {sites.length === 0 ? (
          <Text style={styles.modalEmpty}>現場が未登録です{'\n'}⚙️設定タブから登録できます</Text>
        ) : (
          sites.map((s) => (
            <TouchableOpacity key={s.id} style={styles.modalItem} onPress={() => selectSite(s)}>
              <Text style={styles.modalItemText}>{s.name}</Text>
              <Text style={styles.modalItemSub}>{s.defaultWakeTime}</Text>
            </TouchableOpacity>
          ))
        )}
        {selectedSite && (
          <TouchableOpacity style={styles.modalItem} onPress={() => selectSite(null)}>
            <Text style={[styles.modalItemText, { color: colors.textSecondary }]}>選択を解除</Text>
          </TouchableOpacity>
        )}
      </PickerModal>

      {/* 日付選択モーダル */}
      <PickerModal visible={dateModalVisible} title="日付を選択" onClose={() => setDateModalVisible(false)}>
        <ScrollView style={{ maxHeight: 360 }}>
          {nextDays(14).map((d) => {
            const isSelected = formatDateKey(d) === formatDateKey(date);
            return (
              <TouchableOpacity
                key={formatDateKey(d)}
                style={[styles.modalItem, isSelected && styles.modalItemSelected]}
                onPress={() => { setDate(d); setDateModalVisible(false); }}
              >
                <Text style={[styles.modalItemText, isSelected && { color: colors.accent }]}>
                  {dateLabel(d)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </PickerModal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  container: { padding: 20, paddingBottom: 48 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: colors.textSecondary, marginBottom: 6, marginTop: 14, letterSpacing: 0.5 },
  selectBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 16, paddingVertical: 14 },
  selectBoxText: { flex: 1, fontSize: 16, color: colors.text, fontWeight: '600' },
  selectBoxPlaceholder: { color: colors.textMuted, fontWeight: '400' },
  selectBoxArrow: { fontSize: 10, color: colors.textSecondary },
  timeDisplay: { alignSelf: 'center', backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 32, paddingVertical: 10, marginBottom: 14 },
  timeText: { fontSize: 44, fontWeight: 'bold', color: colors.accent, letterSpacing: 3 },
  pickerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  colon: { fontSize: 24, fontWeight: 'bold', color: colors.text, marginHorizontal: 8, marginTop: -14 },
  drumRollContainer: { alignItems: 'center' },
  drumRollLabel: { fontSize: 11, color: colors.textSecondary, marginBottom: 4 },
  drumRoll: { width: 72, backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border },
  drumRollItem: { alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  drumRollSelected: { backgroundColor: colors.accentDark, marginHorizontal: 4, borderRadius: 8 },
  drumRollText: { fontSize: 19, color: colors.textSecondary, fontWeight: '500' },
  drumRollSelectedText: { color: '#FFFFFF', fontWeight: 'bold' },
  primaryButton: { backgroundColor: colors.accentDark, paddingVertical: 16, borderRadius: 32, alignItems: 'center', marginBottom: 24 },
  primaryButtonDisabled: { opacity: 0.5 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 17, fontWeight: 'bold' },
  section: { marginBottom: 16 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 },
  alarmRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 8, borderWidth: 1, borderColor: colors.border },
  alarmRowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  alarmRowDate: { fontSize: 13, color: colors.textSecondary },
  alarmRowTime: { fontSize: 20, fontWeight: 'bold', color: colors.text, letterSpacing: 1 },
  alarmRowSite: { fontSize: 13, color: colors.accent, flexShrink: 1 },
  rowDeleteBtn: { padding: 6 },
  rowDeleteBtnText: { fontSize: 16 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 28 },
  modalSheet: { backgroundColor: colors.surfaceLight, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: colors.border },
  modalTitle: { fontSize: 16, fontWeight: 'bold', color: colors.text, marginBottom: 12 },
  modalItem: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 13, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  modalItemSelected: { backgroundColor: colors.surface, borderRadius: 8 },
  modalItemText: { fontSize: 16, color: colors.text },
  modalItemSub: { fontSize: 14, color: colors.textSecondary },
  modalEmpty: { color: colors.textSecondary, fontSize: 14, textAlign: 'center', paddingVertical: 16, lineHeight: 22 },
});
