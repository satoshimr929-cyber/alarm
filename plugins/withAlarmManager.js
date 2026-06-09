const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

function addPermissions(manifest) {
  if (!manifest['uses-permission']) manifest['uses-permission'] = [];
  const needed = [
    'android.permission.SCHEDULE_EXACT_ALARM',
    'android.permission.USE_EXACT_ALARM',
    'android.permission.USE_FULL_SCREEN_INTENT',
    'android.permission.RECEIVE_BOOT_COMPLETED',
    'android.permission.WAKE_LOCK',
    'android.permission.VIBRATE',
    'android.permission.POST_NOTIFICATIONS',
  ];
  needed.forEach((perm) => {
    if (!manifest['uses-permission'].find((p) => p.$['android:name'] === perm)) {
      manifest['uses-permission'].push({ $: { 'android:name': perm } });
    }
  });
  return manifest;
}

function addComponents(manifest) {
  const app = manifest.application[0];

  if (!app.activity) app.activity = [];
  if (!app.activity.find((a) => a.$['android:name'] === '.AlarmActivity')) {
    app.activity.push({
      $: {
        'android:name': '.AlarmActivity',
        'android:exported': 'false',
        'android:launchMode': 'singleInstance',
        'android:showWhenLocked': 'true',
        'android:turnScreenOn': 'true',
        'android:excludeFromRecents': 'true',
        'android:taskAffinity': '',
      },
    });
  }

  if (!app.receiver) app.receiver = [];
  if (!app.receiver.find((r) => r.$['android:name'] === '.AlarmReceiver')) {
    app.receiver.push({
      $: { 'android:name': '.AlarmReceiver', 'android:exported': 'false' },
    });
  }
  if (!app.receiver.find((r) => r.$['android:name'] === '.BootReceiver')) {
    app.receiver.push({
      $: { 'android:name': '.BootReceiver', 'android:exported': 'true' },
      'intent-filter': [
        { action: [{ $: { 'android:name': 'android.intent.action.BOOT_COMPLETED' } }] },
      ],
    });
  }

  return manifest;
}

module.exports = function withAlarmManager(config) {
  // 1. AndroidManifest: permissions + components
  config = withAndroidManifest(config, (mod) => {
    mod.modResults.manifest = addPermissions(mod.modResults.manifest);
    mod.modResults.manifest = addComponents(mod.modResults.manifest);
    return mod;
  });

  // 2. Copy Kotlin source files into android project
  config = withDangerousMod(config, [
    'android',
    (mod) => {
      const { platformProjectRoot, projectRoot } = mod.modRequest;
      const destDir = path.join(
        platformProjectRoot,
        'app/src/main/java/com/genba/alarm'
      );
      const srcDir = path.join(projectRoot, 'native/android');
      if (fs.existsSync(srcDir)) {
        fs.readdirSync(srcDir)
          .filter((f) => f.endsWith('.kt'))
          .forEach((f) => {
            fs.copyFileSync(path.join(srcDir, f), path.join(destDir, f));
          });
      }
      return mod;
    },
  ]);

  // 3. Register AlarmPackage in MainApplication.kt
  config = withDangerousMod(config, [
    'android',
    (mod) => {
      const { platformProjectRoot } = mod.modRequest;
      const mainAppPath = path.join(
        platformProjectRoot,
        'app/src/main/java/com/genba/alarm/MainApplication.kt'
      );
      if (fs.existsSync(mainAppPath)) {
        let content = fs.readFileSync(mainAppPath, 'utf8');
        if (!content.includes('AlarmPackage')) {
          content = content.replace(
            'return packages',
            'packages.add(AlarmPackage())\n            return packages'
          );
          fs.writeFileSync(mainAppPath, content, 'utf8');
        }
      }
      return mod;
    },
  ]);

  return config;
};
