package com.genba.alarm

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
        val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val now = System.currentTimeMillis()
        AlarmStore.getAlarms(context).forEach { alarm ->
            if (alarm.timestamp > now) {
                val pi = PendingIntent.getBroadcast(
                    context, alarm.id,
                    Intent(context, AlarmReceiver::class.java).apply {
                        putExtra("alarmId", alarm.id)
                        putExtra("label", alarm.label)
                    },
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                )
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, alarm.timestamp, pi)
                } else {
                    am.setExact(AlarmManager.RTC_WAKEUP, alarm.timestamp, pi)
                }
            } else {
                AlarmStore.removeAlarm(context, alarm.id)
            }
        }
    }
}
