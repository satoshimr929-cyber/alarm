package com.genba.alarm

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import com.facebook.react.bridge.*

class AlarmModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "GENBAAlarmManager"

    private val alarmManager get() =
        reactContext.getSystemService(Context.ALARM_SERVICE) as AlarmManager

    private fun buildPendingIntent(id: Int, label: String): PendingIntent {
        val intent = Intent(reactContext, AlarmReceiver::class.java).apply {
            putExtra("alarmId", id)
            putExtra("label", label)
        }
        return PendingIntent.getBroadcast(
            reactContext, id, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
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
            val intent = Intent(android.provider.Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENTS)
            intent.data = android.net.Uri.parse("package:${reactContext.packageName}")
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            reactContext.startActivity(intent)
        }
        promise.resolve(null)
    }

    @ReactMethod
    fun setAlarm(id: Int, timestamp: Double, label: String, promise: Promise) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !alarmManager.canScheduleExactAlarms()) {
                promise.reject("PERMISSION_DENIED", "SCHEDULE_EXACT_ALARM permission not granted")
                return
            }
            val pi = buildPendingIntent(id, label)
            val triggerAt = timestamp.toLong()
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pi)
            } else {
                alarmManager.setExact(AlarmManager.RTC_WAKEUP, triggerAt, pi)
            }
            AlarmStore.saveAlarm(reactContext, AlarmStore.AlarmData(id, triggerAt, label))
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
                alarmManager.cancel(buildPendingIntent(id, alarm.label))
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
