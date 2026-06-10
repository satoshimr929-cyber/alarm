import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';

export default function SettingsScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>⚙ 設定</Text>
      <Text style={styles.placeholder}>現場マスター・促し通知の設定がここに表示されます</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { fontSize: 22, fontWeight: 'bold', color: colors.text, marginBottom: 8 },
  placeholder: { fontSize: 13, color: colors.textSecondary, textAlign: 'center' },
});
