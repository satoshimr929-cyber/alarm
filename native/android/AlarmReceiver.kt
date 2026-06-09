package com.genba.alarm

import android.app.*
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.os.Build
import android.provider.Settings

class AlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val alarmId = intent.getIntExtra("alarmId", 0)
        val label = intent.getStringExtra("label") ?: "アラーム"

        ensureChannel(context)

        val activityIntent = Intent(context, AlarmActivity::class.java).apply {
            addFlags(
                Intent.FLAG_ACTIVITY_NEW_TASK or
                Intent.FLAG_ACTIVITY_NO_USER_ACTION or
                Intent.FLAG_ACTIVITY_SINGLE_TOP
            )
            putExtra("alarmId", alarmId)
            putExtra("label", label)
        }

        val fullScreenPi = PendingIntent.getActivity(
            context, alarmId, activityIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        val notif = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(context, CHANNEL_ID)
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(context)
        }.apply {
            setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            setContentTitle("GENBAAlarm")
            setContentText(label)
            setCategory(Notification.CATEGORY_ALARM)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                setPriority(Notification.PRIORITY_MAX)
            }
            setFullScreenIntent(fullScreenPi, true)
            setOngoing(true)
            setAutoCancel(false)
            setVisibility(Notification.VISIBILITY_PUBLIC)
            setContentIntent(fullScreenPi)
        }.build()

        nm.notify(alarmId, notif)

        // Android 10未満 または USE_FULL_SCREEN_INTENT許可済み → 直接起動も試みる
        val canDirectStart = if (Build.VERSION.SDK_INT >= 34) {
            nm.canUseFullScreenIntent()
        } else {
            true
        }
        if (canDirectStart) {
            try {
                context.startActivity(activityIntent)
            } catch (_: Exception) {
                // 通知のfullScreenIntentにフォールバック
            }
        }
    }

    companion object {
        const val CHANNEL_ID = "genba_native_alarm"

        fun ensureChannel(context: Context) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
                if (nm.getNotificationChannel(CHANNEL_ID) != null) return
                val channel = NotificationChannel(
                    CHANNEL_ID, "GENBAAlarm", NotificationManager.IMPORTANCE_HIGH
                ).apply {
                    setSound(
                        Settings.System.DEFAULT_ALARM_ALERT_URI,
                        AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_ALARM)
                            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                            .build()
                    )
                    enableVibration(true)
                    lockscreenVisibility = Notification.VISIBILITY_PUBLIC
                }
                nm.createNotificationChannel(channel)
            }
        }
    }
}
