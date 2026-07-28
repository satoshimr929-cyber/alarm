import { StatusBar } from 'expo-status-bar';
import { Text } from 'react-native';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import HomeScreen from './src/screens/HomeScreen';
import AlarmListScreen from './src/screens/AlarmListScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import { colors } from './src/theme';

const Tab = createBottomTabNavigator();

const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.background,
    card: colors.surface,
    border: colors.border,
    primary: colors.accent,
    text: colors.text,
  },
};

function tabIcon(emoji) {
  return ({ focused }) => (
    <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.45 }}>{emoji}</Text>
  );
}

export default function App() {
  return (
    <NavigationContainer theme={navTheme}>
      <StatusBar style="light" />
      <Tab.Navigator
        screenOptions={{
          headerTitle: '⚡GENBA',
          headerTitleStyle: { color: colors.accent, fontWeight: 'bold', fontSize: 20 },
          headerStyle: { backgroundColor: colors.surface },
          tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
          tabBarActiveTintColor: colors.accent,
          tabBarInactiveTintColor: colors.textSecondary,
        }}
      >
        <Tab.Screen
          name="Home"
          component={HomeScreen}
          options={{ title: 'ホーム', tabBarIcon: tabIcon('🏠') }}
        />
        <Tab.Screen
          name="AlarmList"
          component={AlarmListScreen}
          options={{ title: 'アラーム一覧', tabBarIcon: tabIcon('⏰') }}
        />
        <Tab.Screen
          name="Settings"
          component={SettingsScreen}
          options={{ title: '設定', tabBarIcon: tabIcon('⚙️') }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
