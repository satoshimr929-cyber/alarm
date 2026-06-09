import { registerRootComponent } from 'expo';
import notifee, { EventType } from '@notifee/react-native';
// バックグラウンドタスクの定義はrootComponent登録前に必須
import './src/backgroundTask';
import App from './App';

// アプリがバックグラウンド/終了状態での通知イベント処理
notifee.onBackgroundEvent(async ({ type, detail }) => {
  if (type === EventType.PRESS) {
    // タップ時はアプリが起動し、foregroundEventで処理される
  }
});

registerRootComponent(App);
