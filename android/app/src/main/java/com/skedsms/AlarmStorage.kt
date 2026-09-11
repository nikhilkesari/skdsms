package com.skedsms

import android.content.Context
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject

data class AlarmRecord(
    val id: String,
    val timestampMs: Long,
    val alarmRequestCode: Int,
    val recipientName: String,
    val phoneNumber: String,
    val messageText: String
) {
    fun toJsonObject(): JSONObject {
        return JSONObject().apply {
            put("id", id)
            put("timestampMs", timestampMs)
            put("alarmRequestCode", alarmRequestCode)
            put("recipientName", recipientName)
            put("phoneNumber", phoneNumber)
            put("messageText", messageText)
        }
    }

    companion object {
        fun fromJsonObject(json: JSONObject): AlarmRecord {
            return AlarmRecord(
                id = json.getString("id"),
                timestampMs = json.getLong("timestampMs"),
                alarmRequestCode = json.getInt("alarmRequestCode"),
                recipientName = json.optString("recipientName", ""),
                phoneNumber = json.getString("phoneNumber"),
                messageText = json.getString("messageText")
            )
        }
    }
}

object AlarmStorage {
    private const val TAG = "AlarmStorage"
    private const val PREFS_NAME = "sked_sms_alarms"
    private const val KEY_ACTIVE_ALARMS = "active_alarms"
    private const val KEY_EXECUTION_LOG = "execution_log"

    @Synchronized
    fun saveAlarm(context: Context, record: AlarmRecord) {
        try {
            val alarms = getAllAlarms(context).toMutableList()
            // Remove existing record with same request code or ID if present
            alarms.removeAll { it.alarmRequestCode == record.alarmRequestCode || it.id == record.id }
            alarms.add(record)

            val jsonArray = JSONArray()
            for (alarm in alarms) {
                jsonArray.put(alarm.toJsonObject())
            }

            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            prefs.edit().putString(KEY_ACTIVE_ALARMS, jsonArray.toString()).apply()
            Log.i(TAG, "Saved alarm ${record.id} (code: ${record.alarmRequestCode}), total active: ${alarms.size}")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to save alarm record", e)
        }
    }

    @Synchronized
    fun removeAlarm(context: Context, alarmRequestCode: Int) {
        try {
            val alarms = getAllAlarms(context).toMutableList()
            val removed = alarms.removeAll { it.alarmRequestCode == alarmRequestCode }
            if (removed) {
                val jsonArray = JSONArray()
                for (alarm in alarms) {
                    jsonArray.put(alarm.toJsonObject())
                }
                val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                prefs.edit().putString(KEY_ACTIVE_ALARMS, jsonArray.toString()).apply()
                Log.i(TAG, "Removed alarm code: $alarmRequestCode, remaining active: ${alarms.size}")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to remove alarm record", e)
        }
    }

    @Synchronized
    fun getAllAlarms(context: Context): List<AlarmRecord> {
        val result = mutableListOf<AlarmRecord>()
        try {
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val raw = prefs.getString(KEY_ACTIVE_ALARMS, null) ?: return emptyList()
            val jsonArray = JSONArray(raw)
            for (i in 0 until jsonArray.length()) {
                val obj = jsonArray.getJSONObject(i)
                result.add(AlarmRecord.fromJsonObject(obj))
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to read alarm records", e)
        }
        return result
    }

    @Synchronized
    fun recordExecution(context: Context, scheduleId: String, success: Boolean, error: String? = null) {
        try {
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val raw = prefs.getString(KEY_EXECUTION_LOG, "{}") ?: "{}"
            val json = JSONObject(raw)

            val entry = JSONObject().apply {
                put("scheduleId", scheduleId)
                put("success", success)
                put("timestamp", System.currentTimeMillis())
                put("error", error ?: "")
            }
            json.put(scheduleId, entry)
            prefs.edit().putString(KEY_EXECUTION_LOG, json.toString()).apply()
        } catch (e: Exception) {
            Log.e(TAG, "Failed to record execution log", e)
        }
    }

    @Synchronized
    fun clearAll(context: Context) {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit().clear().apply()
    }
}
