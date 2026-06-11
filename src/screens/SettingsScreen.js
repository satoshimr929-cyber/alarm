import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  FlatList,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  ToastAndroid,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getSites, saveSites } from '../alarmData';
import { getSettings, saveSettings, defaultExtraAlarms } from '../storage';
import { getRingtoneList, playRingtone, stopRingtone } from '../nativeAlarm';
import { colors } from '../theme';

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);
const SHEET_HEIGHT = 420;

function pad(n) { return String(n).padStart(2, '0'); }

function showToast(msg) {
  if (Platform.OS === 'android') ToastAndroid.show(msg, ToastAndroid.SHORT);
  else Alert.alert(msg);
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

function SiteModal({ visible, initial, onSave, onClose }) {
  const [name, setName] = useState(initial?.name || '');
  const [h, setH] = useState(() => {
    if (initial?.defaultWakeTime) return parseInt(initial.defaultWakeTime.split(':')[0], 10);
    return 5;
  });
  const [m, setM] = useState(() => {
    if (initial?.defaultWakeTime) return parseInt(initial.defaultWakeTime.split(':')[1], 10);
    return 0;
  });

  const isEdit = !!initial;

  function handleSave() {
    if (!name.trim()) { showToast('現場名を入力してください'); return; }
    onSave({ name: name.trim(), defaultWakeTime: `${pad(h)}:${pad(m)}` });
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalSheet}>
          <Text style={styles.modalTitle}>{isEdit ? '現場を編集' : '現場を追加'}</Text>

          <Text style={styles.fieldLabel}>現場名</Text>
          <TextInput
            style={styles.textInput}
            value={name}
            onChangeText={setName}
            placeholder="例：〇〇マンション新築"
            placeholderTextColor={colors.textMuted}
            maxLength={30}
          />

          <Text style={styles.fieldLabel}>デフォルト起床時刻</Text>
          <View style={styles.pickerRow}>
            <DrumRoll items={HOURS} selected={h} onSelect={setH} label="時" />
            <Text style={styles.colon}>:</Text>
            <DrumRoll items={MINUTES} selected={m} onSelect={setM} label="分" />
          </View>

          <TouchableOpacity style={styles.saveButton} onPress={handleSave} activeOpacity={0.8}>
            <Text style={styles.saveButtonText}>{isEdit ? '更新する' : '追加する'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelLink} onPress={onClose}>
            <Text style={styles.cancelLinkText}>キャンセル</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function NotifyModal({ visible, hour, minute, onSave, onClose }) {
  const [h, setH] = useState(hour);
  const [m, setM] = useState(minute);
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalSheet}>
          <Text style={styles.modalTitle}>促し通知の時間</Text>
          <Text style={styles.modalSubtitle}>翌日アラーム未登録の場合この時刻に通知を送ります</Text>
          <View style={styles.pickerRow}>
            <DrumRoll items={HOURS} selected={h} onSelect={setH} label="時" />
            <Text style={styles.colon}>:</Text>
            <DrumRoll items={MINUTES} selected={m} onSelect={setM} label="分" />
          </View>
          <TouchableOpacity style={styles.saveButton} onPress={() => onSave(h, m)} activeOpacity={0.8}>
            <Text style={styles.saveButtonText}>保存する</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelLink} onPress={onClose}>
            <Text style={styles.cancelLinkText}>キャンセル</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function RingtoneSheet({ visible, ringtones, selectedUri, onSelect, onClose }) {
  const slideAnim = useRef(new Animated.Value(SHEET_HEIGHT)).current;
  const [playingUri, setPlayingUri] = useState(null);

  const prevVisible = useRef(false);
  if (visible && !prevVisible.current) {
    setPlayingUri(null);
  }
  prevVisible.current = visible;

  if (visible) {
    Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, bounciness: 0, speed: 20 }).start();
  } else {
    Animated.timing(slideAnim, { toValue: SHEET_HEIGHT, duration: 200, useNativeDriver: true }).start();
  }

  async function handlePreview(uri) {
    if (playingUri === uri) {
      await stopRingtone();
      setPlayingUri(null);
    } else {
      await playRingtone(uri);
      setPlayingUri(uri);
    }
  }

  async function handleSelect(item) {
    await stopRingtone();
    setPlayingUri(null);
    onSelect(item);
  }

  async function handleClose() {
    await stopRingtone();
    setPlayingUri(null);
    onClose();
  }

  const DEFAULT_ITEM = { title: 'システムデフォルト', uri: '' };
  const allItems = [DEFAULT_ITEM, ...ringtones];

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={handleClose}>
      <TouchableWithoutFeedback onPress={handleClose}>
        <View style={styles.sheetOverlay} />
      </TouchableWithoutFeedback>
      <Animated.View style={[styles.bottomSheet, { transform: [{ translateY: slideAnim }] }]}>
        <View style={styles.sheetHandle} />
        <Text style={styles.sheetTitle}>アラーム音を選択</Text>
        <FlatList
          data={allItems}
          keyExtractor={(item) => item.uri}
          style={styles.ringtoneList}
          renderItem={({ item }) => {
            const isSelected = item.uri === selectedUri;
            const isPlaying = item.uri === playingUri && item.uri !== '';
            return (
              <TouchableOpacity
                style={[styles.ringtoneRow, isSelected && styles.ringtoneRowSelected]}
                onPress={() => handleSelect(item)}
                activeOpacity={0.7}
              >
                <Text style={[styles.ringtoneTitle, isSelected && styles.ringtoneTitleSelected]} numberOfLines={1}>
                  {isSelected ? '✓ ' : ''}{item.title}
                </Text>
                {item.uri !== '' && (
                  <TouchableOpacity
                    style={styles.previewBtn}
                    onPress={() => handlePreview(item.uri)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={styles.previewBtnText}>{isPlaying ? '⏹' : '▶'}</Text>
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            );
          }}
        />
      </Animated.View>
    </Modal>
  );
}

export default function SettingsScreen() {
  const [sites, setSites] = useState([]);
  const [notifyHour, setNotifyHour] = useState(22);
  const [notifyMinute, setNotifyMinute] = useState(0);
  const [extraAlarms, setExtraAlarms] = useState(defaultExtraAlarms());
  const [ringtoneUri, setRingtoneUri] = useState('');
  const [ringtoneTitle, setRingtoneTitle] = useState('システムデフォルト');
  const [ringtones, setRingtones] = useState([]);
  const [siteModal, setSiteModal] = useState({ visible: false, site: null });
  const [notifyModalVisible, setNotifyModalVisible] = useState(false);
  const [ringtoneSheetVisible, setRingtoneSheetVisible] = useState(false);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        setSites(await getSites());
        const s = await getSettings();
        setNotifyHour(s.notifyHour);
        setNotifyMinute(s.notifyMinute);
        setExtraAlarms(s.extraAlarms);
        setRingtoneUri(s.ringtoneUri || '');
        setRingtoneTitle(s.ringtoneTitle || 'システムデフォルト');
      })();
    }, [])
  );

  async function openRingtoneSheet() {
    if (ringtones.length === 0) {
      try {
        const list = await getRingtoneList();
        setRingtones(list);
      } catch {
        setRingtones([]);
      }
    }
    setRingtoneSheetVisible(true);
  }

  async function handleSelectRingtone(item) {
    const uri = item.uri;
    const title = item.uri === '' ? 'システムデフォルト' : item.title;
    setRingtoneUri(uri);
    setRingtoneTitle(title);
    setRingtoneSheetVisible(false);
    const s = await getSettings();
    await saveSettings({ ...s, ringtoneUri: uri, ringtoneTitle: title });
    showToast(`「${title}」に設定しました`);
  }

  async function handleSaveSite({ name, defaultWakeTime }) {
    let next;
    if (siteModal.site) {
      next = sites.map((s) =>
        s.id === siteModal.site.id ? { ...s, name, defaultWakeTime } : s
      );
    } else {
      next = [...sites, { id: `site_${Date.now()}`, name, defaultWakeTime }];
    }
    await saveSites(next);
    setSites(next);
    setSiteModal({ visible: false, site: null });
    showToast(siteModal.site ? '更新しました' : '追加しました');
  }

  function handleDeleteSite(site) {
    Alert.alert(`「${site.name}」を削除`, 'この現場をマスターから削除しますか？', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除する', style: 'destructive',
        onPress: async () => {
          const next = sites.filter((s) => s.id !== site.id);
          await saveSites(next);
          setSites(next);
          showToast('削除しました');
        },
      },
    ]);
  }

  async function handleToggleExtra(offset) {
    const next = extraAlarms.map((e) =>
      e.offset === offset ? { ...e, enabled: !e.enabled } : e
    );
    setExtraAlarms(next);
    const s = await getSettings();
    await saveSettings({ ...s, extraAlarms: next });
  }

  async function handleSaveNotify(h, m) {
    const s = await getSettings();
    await saveSettings({ ...s, notifyHour: h, notifyMinute: m });
    setNotifyHour(h);
    setNotifyMinute(m);
    setNotifyModalVisible(false);
    showToast(`促し通知を ${pad(h)}:${pad(m)} に設定しました`);
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      {/* 現場マスター */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionLabel}>現場マスター</Text>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => setSiteModal({ visible: true, site: null })}
        >
          <Text style={styles.addBtnText}>＋ 追加</Text>
        </TouchableOpacity>
      </View>

      {sites.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>現場が未登録です</Text>
        </View>
      ) : (
        sites.map((s) => (
          <View key={s.id} style={styles.card}>
            <TouchableOpacity
              style={styles.cardMain}
              onPress={() => setSiteModal({ visible: true, site: s })}
            >
              <Text style={styles.cardName}>{s.name}</Text>
              <Text style={styles.cardTime}>{s.defaultWakeTime}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => handleDeleteSite(s)} style={styles.deleteBtn}>
              <Text style={styles.deleteBtnText}>🗑</Text>
            </TouchableOpacity>
          </View>
        ))
      )}

      {/* アラーム音 */}
      <Text style={[styles.sectionLabel, { marginTop: 32 }]}>アラーム音</Text>
      <TouchableOpacity style={styles.settingRow} onPress={openRingtoneSheet}>
        <Text style={styles.settingRowLabel}>🔔 サウンド</Text>
        <View style={styles.settingRowRight}>
          <Text style={styles.settingRowValue} numberOfLines={1}>{ringtoneTitle}</Text>
          <Text style={styles.settingRowArrow}>›</Text>
        </View>
      </TouchableOpacity>
      <Text style={styles.settingRowHint}>アラーム鳴動時に使用する音を選択します</Text>

      {/* 追加アラーム */}
      <Text style={[styles.sectionLabel, { marginTop: 32 }]}>追加アラーム</Text>
      <Text style={styles.extraHint}>起床時刻の前後に自動でアラームを追加します</Text>
      {[
        { label: '起床前', offsets: [-5, -10, -15, -20, -25, -30] },
        { label: '起床後', offsets: [5, 10, 15, 20, 25, 30] },
      ].map(({ label, offsets }) => (
        <View key={label} style={styles.extraGroup}>
          <Text style={styles.extraGroupLabel}>{label}</Text>
          {offsets.map((offset) => {
            const entry = extraAlarms.find((e) => e.offset === offset);
            const enabled = entry?.enabled ?? false;
            const absMin = Math.abs(offset);
            return (
              <View key={offset} style={styles.extraRow}>
                <Text style={styles.extraRowText}>{absMin}分</Text>
                <Switch
                  value={enabled}
                  onValueChange={() => handleToggleExtra(offset)}
                  thumbColor={enabled ? colors.accent : colors.textMuted}
                  trackColor={{ false: colors.border, true: colors.accentDark }}
                />
              </View>
            );
          })}
        </View>
      ))}

      {/* 促し通知 */}
      <Text style={[styles.sectionLabel, { marginTop: 32 }]}>促し通知</Text>
      <TouchableOpacity style={styles.settingRow} onPress={() => setNotifyModalVisible(true)}>
        <Text style={styles.settingRowLabel}>通知時刻</Text>
        <View style={styles.settingRowRight}>
          <Text style={styles.settingRowValue}>{pad(notifyHour)}:{pad(notifyMinute)}</Text>
          <Text style={styles.settingRowArrow}>›</Text>
        </View>
      </TouchableOpacity>
      <Text style={styles.settingRowHint}>翌日アラームが未登録の場合のみ送信されます</Text>

      <SiteModal
        visible={siteModal.visible}
        initial={siteModal.site}
        onSave={handleSaveSite}
        onClose={() => setSiteModal({ visible: false, site: null })}
      />
      <NotifyModal
        visible={notifyModalVisible}
        hour={notifyHour}
        minute={notifyMinute}
        onSave={handleSaveNotify}
        onClose={() => setNotifyModalVisible(false)}
      />
      <RingtoneSheet
        visible={ringtoneSheetVisible}
        ringtones={ringtones}
        selectedUri={ringtoneUri}
        onSelect={handleSelectRingtone}
        onClose={() => setRingtoneSheetVisible(false)}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  container: { padding: 20, paddingBottom: 48 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 },
  addBtn: { backgroundColor: colors.accentDark, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16 },
  addBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  emptyBox: { backgroundColor: colors.surface, borderRadius: 12, padding: 20, alignItems: 'center', borderWidth: 1, borderColor: colors.border, marginBottom: 8 },
  emptyText: { color: colors.textMuted, fontSize: 14 },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: 12, paddingLeft: 16, paddingRight: 8, paddingVertical: 14, marginBottom: 8, borderWidth: 1, borderColor: colors.border },
  cardMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardName: { flex: 1, fontSize: 16, color: colors.text, fontWeight: '600' },
  cardTime: { fontSize: 15, color: colors.accent, fontWeight: '600' },
  deleteBtn: { padding: 8 },
  deleteBtnText: { fontSize: 18 },
  settingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 16, borderWidth: 1, borderColor: colors.border },
  settingRowLabel: { fontSize: 16, color: colors.text, fontWeight: '500' },
  settingRowRight: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, justifyContent: 'flex-end' },
  settingRowValue: { fontSize: 15, color: colors.accent, fontWeight: '600', maxWidth: 180 },
  settingRowArrow: { fontSize: 20, color: colors.textSecondary },
  settingRowHint: { fontSize: 11, color: colors.textMuted, marginTop: 6, marginLeft: 4 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: colors.surfaceLight, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 28, paddingBottom: 40, borderWidth: 1, borderColor: colors.border },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: colors.text, marginBottom: 6, textAlign: 'center' },
  modalSubtitle: { fontSize: 12, color: colors.textSecondary, marginBottom: 20, textAlign: 'center' },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: colors.textSecondary, marginBottom: 6, marginTop: 12, letterSpacing: 0.5 },
  textInput: { backgroundColor: colors.surface, borderRadius: 10, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: colors.text, marginBottom: 4 },
  pickerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginVertical: 12 },
  colon: { fontSize: 24, fontWeight: 'bold', color: colors.text, marginHorizontal: 8, marginTop: -14 },
  drumRollContainer: { alignItems: 'center' },
  drumRollLabel: { fontSize: 11, color: colors.textSecondary, marginBottom: 4 },
  drumRoll: { width: 72, backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border },
  drumRollItem: { alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  drumRollSelected: { backgroundColor: colors.accentDark, marginHorizontal: 4, borderRadius: 8 },
  drumRollText: { fontSize: 19, color: colors.textSecondary, fontWeight: '500' },
  drumRollSelectedText: { color: '#FFFFFF', fontWeight: 'bold' },
  saveButton: { backgroundColor: colors.accentDark, paddingVertical: 14, borderRadius: 28, alignItems: 'center', marginTop: 8, marginBottom: 10 },
  saveButtonText: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
  cancelLink: { alignItems: 'center', padding: 8 },
  cancelLinkText: { color: colors.textSecondary, fontSize: 14 },
  extraHint: { fontSize: 11, color: colors.textMuted, marginBottom: 10 },
  extraGroup: { backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 16, marginBottom: 10 },
  extraGroupLabel: { fontSize: 12, fontWeight: '700', color: colors.textSecondary, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  extraRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  extraRowText: { fontSize: 15, color: colors.text },
  // ボトムシート（アラーム音）
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  bottomSheet: { position: 'absolute', bottom: 0, left: 0, right: 0, height: SHEET_HEIGHT, backgroundColor: colors.surfaceLight, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 0, paddingBottom: 24, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  sheetHandle: { width: 40, height: 4, backgroundColor: colors.border, borderRadius: 2, marginTop: 12, marginBottom: 8 },
  sheetTitle: { fontSize: 15, fontWeight: '700', color: colors.textSecondary, marginBottom: 8 },
  ringtoneList: { width: '100%' },
  ringtoneRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
  ringtoneRowSelected: { backgroundColor: colors.surface },
  ringtoneTitle: { flex: 1, fontSize: 15, color: colors.text },
  ringtoneTitleSelected: { color: colors.accent, fontWeight: '700' },
  previewBtn: { paddingHorizontal: 10, paddingVertical: 4 },
  previewBtnText: { fontSize: 16, color: colors.textSecondary },
});
