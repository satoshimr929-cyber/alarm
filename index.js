import { registerRootComponent } from 'expo';
import notifee from '@notifee/react-native';
// バックグラウンドタスクの定義はrootComponent登録前に必須
import './src/backgroundTask';
import App from './App';

// notifee はバックグラウンドイベントハンドラの登録を必須とする。
// タップ時のアプリ起動は pressAction.launchActivity が、通知の消去は
// autoCancel が担うため、ここで cancelNotification は呼ばない
// （繰り返しトリガー自体が削除されてしまう）。
notifee.onBackgroundEvent(async () => {});

registerRootComponent(App);
