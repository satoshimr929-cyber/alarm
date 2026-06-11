package com.genba.alarm

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

object AlarmStore {
    private const val PREF_NAME = "genba_native_alarms"
    private const val KEY_ALARMS = "alarms"

    data class AlarmData(val id: Int, val timestamp: Long, val label: String, val ringtoneUri: String = "")

    fun saveAlarm(context: Context, alarm: AlarmData) {
        val prefs = context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
        val list = getAlarms(context).toMutableList()
        list.removeAll { it.id == alarm.id }
        list.add(alarm)
        prefs.edit().putString(KEY_ALARMS, toJson(list)).apply()
    }

    fun removeAlarm(context: Context, id: Int) {
        val prefs = context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
        val list = getAlarms(context).filter { it.id != id }
        prefs.edit().putString(KEY_ALARMS, toJson(list)).apply()
    }

    fun getAlarms(context: Context): List<AlarmData> {
        val prefs = context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
        return try {
            val arr = JSONArray(prefs.getString(KEY_ALARMS, "[]") ?: "[]")
            (0 until arr.length()).map {
                val o = arr.getJSONObject(it)
                AlarmData(
                    o.getInt("id"),
                    o.getLong("timestamp"),
                    o.getString("label"),
                    o.optString("ringtoneUri", "")
                )
            }
        } catch (e: Exception) { emptyList() }
    }

    private fun toJson(list: List<AlarmData>): String {
        val arr = JSONArray()
        list.forEach { a ->
            arr.put(JSONObject().apply {
                put("id", a.id)
                put("timestamp", a.timestamp)
                put("label", a.label)
                put("ringtoneUri", a.ringtoneUri)
            })
        }
        return arr.toString()
    }
}
