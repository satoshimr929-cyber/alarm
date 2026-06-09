import { registerRootComponent } from 'expo';
// バックグラウンドタスクの定義はrootComponent登録前に必須
import './src/backgroundTask';
import App from './App';

registerRootComponent(App);
