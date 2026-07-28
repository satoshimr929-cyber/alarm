package com.genba.alarm

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import com.facebook.react.bridge.*

class AlarmModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "GENBAAlarmManager"

    private val alarmManager get() =
        reactContext.getSystemService(Context.ALARM_SERVICE) as AlarmManager

    private var previewRingtone: android.media.Ringtone? = null

    private fun buildPendingIntent(id: Int, label: String, ringtoneUri: String = ""): PendingIntent {
        val intent = Intent(reactContext, AlarmReceiver::class.java).apply {
            putExtra("alarmId", id)
            putExtra("label", label)
            putExtra("ringtoneUri", ringtoneUri)
        }
        return PendingIntent.getBroadcast(
            reactContext, id, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }

    @ReactMethod
    fun getRingtoneList(promise: Promise) {
        try {
            val manager = RingtoneManager(reactContext).apply {
                setType(RingtoneManager.TYPE_ALARM)
            }
            val cursor = manager.cursor
            val arr = Arguments.createArray()
            while (cursor.moveToNext()) {
                val uri = manager.getRingtoneUri(cursor.position).toString()
                val title = cursor.getString(RingtoneManager.TITLE_COLUMN_INDEX) ?: "Unknown"
                Arguments.createMap().also { m ->
                    m.putString("title", title)
                    m.putString("uri", uri)
                    arr.pushMap(m)
                }
            }
            cursor.close()
            promise.resolve(arr)
        } catch (e: Exception) {
            promise.reject("ERROR", e.message ?: "Unknown error")
        }
    }

    @ReactMethod
    fun playRingtone(uri: String, promise: Promise) {
        try {
            previewRingtone?.stop()
            previewRingtone = null
            val ringtoneUri = Uri.parse(uri)
            val ringtone = RingtoneManager.getRingtone(reactContext, ringtoneUri)
            ringtone?.audioAttributes = AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ALARM)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build()
            ringtone?.play()
            previewRingtone = ringtone
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("ERROR", e.message ?: "Unknown error")
        }
    }

    @ReactMethod
    fun stopRingtone(promise: Promise) {
        try {
            previewRingtone?.stop()
            previewRingtone = null
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("ERROR", e.message ?: "Unknown error")
        }
    }

    @ReactMethod
    fun canUseFullScreenIntent(promise: Promise) {
        if (Build.VERSION.SDK_INT >= 34) {
            val nm = reactContext.getSystemService(Context.NOTIFICATION_SERVICE) as android.app.NotificationManager
            promise.resolve(nm.canUseFullScreenIntent())
        } else {
            promise.resolve(true)
        }
    }

    @ReactMethod
    fun openFullScreenIntentSettings(promise: Promise) {
        if (Build.VERSION.SDK_INT >= 34) {
            val intent = Intent("android.settings.MANAGE_APP_USE_FULL_SCREEN_INTENTS")
            intent.data = android.net.Uri.parse("package:${reactContext.packageName}")
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            reactContext.startActivity(intent)
        }
        promise.resolve(null)
    }

    @ReactMethod
    fun setAlarm(id: Int, timestamp: Double, label: String, ringtoneUri: String, promise: Promise) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !alarmManager.canScheduleExactAlarms()) {
                promise.reject("PERMISSION_DENIED", "SCHEDULE_EXACT_ALARM permission not granted")
                return
            }
            val pi = buildPendingIntent(id, label, ringtoneUri)
            val triggerAt = timestamp.toLong()
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pi)
            } else {
                alarmManager.setExact(AlarmManager.RTC_WAKEUP, triggerAt, pi)
            }
            AlarmStore.saveAlarm(reactContext, AlarmStore.AlarmData(id, triggerAt, label, ringtoneUri))
            AlarmReceiver.ensureChannel(reactContext)
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("ERROR", e.message ?: "Unknown error")
        }
    }

    @ReactMethod
    fun cancelAlarm(id: Int, promise: Promise) {
        try {
            val alarm = AlarmStore.getAlarms(reactContext).find { it.id == id }
            if (alarm != null) {
                alarmManager.cancel(buildPendingIntent(id, alarm.label, alarm.ringtoneUri))
            }
            AlarmStore.removeAlarm(reactContext, id)
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("ERROR", e.message ?: "Unknown error")
        }
    }

    @ReactMethod
    fun getScheduledAlarms(promise: Promise) {
        try {
            val arr = Arguments.createArray()
            AlarmStore.getAlarms(reactContext).forEach { alarm ->
                Arguments.createMap().also { m ->
                    m.putInt("id", alarm.id)
                    m.putDouble("timestamp", alarm.timestamp.toDouble())
                    m.putString("label", alarm.label)
                    m.putString("ringtoneUri", alarm.ringtoneUri)
                    arr.pushMap(m)
                }
            }
            promise.resolve(arr)
        } catch (e: Exception) {
            promise.reject("ERROR", e.message ?: "Unknown error")
        }
    }

    @ReactMethod
    fun canScheduleExactAlarms(promise: Promise) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            promise.resolve(alarmManager.canScheduleExactAlarms())
        } else {
            promise.resolve(true)
        }
    }

    @ReactMethod
    fun openAlarmPermissionSettings(promise: Promise) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            reactContext.startActivity(
                Intent(android.provider.Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            )
        }
        promise.resolve(null)
    }
}
