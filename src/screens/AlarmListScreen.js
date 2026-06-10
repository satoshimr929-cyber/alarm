import { useCallback, useState } from 'react';
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  ToastAndroid,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { cleanupPastAlarms, deleteAlarm, formatDateKey } from '../alarmData';
import { colors } from '../theme';

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

function showToast(msg) {
  if (Platform.OS === 'android') ToastAndroid.show(msg, ToastAndroid.SHORT);
  else Alert.alert(msg);
}

function prettyDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const todayKey = formatDateKey(new Date());
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const base = `${m}/${d}（${WEEKDAYS[date.getDay()]}）`;
  if (dateStr === todayKey) return `今日 ${base}`;
  if (dateStr === formatDateKey(tomorrow)) return `明日 ${base}`;
  return base;
}

export default function AlarmListScreen() {
  const [alarms, setAlarms] = useState([]);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        setAlarms(await cleanupPastAlarms());
      })();
    }, [])
  );

  function handleDelete(alarm) {
    Alert.alert(`${alarm.wakeTime} を削除`, `${prettyDate(alarm.date)} のアラームを削除しますか？`, [
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
      {alarms.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyIcon}>⏰</Text>
          <Text style={styles.emptyText}>登録済みのアラームはありません</Text>
          <Text style={styles.emptyHint}>🏠ホームタブからセットしてください</Text>
        </View>
      ) : (
        alarms.map((a) => (
          <View key={a.id} style={styles.card}>
            <View style={styles.cardMain}>
              <Text style={styles.cardDate}>{prettyDate(a.date)}</Text>
              <View style={styles.cardRow}>
                <Text style={styles.cardTime}>{a.wakeTime}</Text>
                {!!a.siteName && <Text style={styles.cardSite}>{a.siteName}</Text>}
              </View>
            </View>
            <TouchableOpacity onPress={() => handleDelete(a)} style={styles.deleteBtn}>
              <Text style={styles.deleteBtnText}>🗑</Text>
            </TouchableOpacity>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  container: { padding: 20, paddingBottom: 48 },
  emptyBox: { alignItems: 'center', paddingVertical: 64 },
  emptyIcon: { fontSize: 40, marginBottom: 12, opacity: 0.5 },
  emptyText: { color: colors.textSecondary, fontSize: 15, fontWeight: '600' },
  emptyHint: { color: colors.textMuted, fontSize: 12, marginTop: 6 },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: 14, paddingHorizontal: 18, paddingVertical: 14, marginBottom: 10, borderWidth: 1, borderColor: colors.border },
  cardMain: { flex: 1 },
  cardDate: { fontSize: 13, color: colors.textSecondary, marginBottom: 4 },
  cardRow: { flexDirection: 'row', alignItems: 'baseline', gap: 12 },
  cardTime: { fontSize: 26, fontWeight: 'bold', color: colors.text, letterSpacing: 1 },
  cardSite: { fontSize: 14, color: colors.accent, flexShrink: 1 },
  deleteBtn: { padding: 8 },
  deleteBtnText: { fontSize: 18 },
});
