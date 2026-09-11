package com.skedsms

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import com.facebook.react.bridge.*
import org.json.JSONArray
import org.json.JSONObject

class AlarmSchedulerModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val TAG = "AlarmSchedulerModule"
        const val MODULE_NAME = "AlarmSchedulerModule"
    }

    override fun getName(): String = MODULE_NAME

    @ReactMethod
    fun scheduleAlarm(
        id: String,
        timestampMs: Double,
        alarmRequestCode: Int,
        recipientName: String,
        phoneNumber: String,
        messageText: String,
        promise: Promise
    ) {
        try {
            val alarmManager = reactContext.getSystemService(Context.ALARM_SERVICE) as? AlarmManager
            if (alarmManager == null) {
                promise.reject("ERR_ALARM_SERVICE", "AlarmManager system service is unavailable")
                return
            }

            val triggerTime = timestampMs.toLong()
            val now = System.currentTimeMillis()
            if (triggerTime <= now) {
                promise.reject(
                    "ERR_PAST_TIMESTAMP",
                    "Cannot schedule an alarm in the past (trigger: $triggerTime, now: $now)"
                )
                return
            }

            scheduleAlarmInternal(
                id = id,
                triggerTime = triggerTime,
                alarmRequestCode = alarmRequestCode,
                recipientName = recipientName,
                phoneNumber = phoneNumber,
                messageText = messageText
            )

            Log.i(TAG, "Successfully scheduled alarm for $id (code: $alarmRequestCode) at $triggerTime")

            val result = Arguments.createMap().apply {
                putBoolean("success", true)
                putString("id", id)
                putInt("alarmRequestCode", alarmRequestCode)
                putDouble("scheduledTimestamp", timestampMs)
            }
            promise.resolve(result)

        } catch (e: Exception) {
            Log.e(TAG, "Failed to schedule alarm for $id", e)
            promise.reject("ERR_SCHEDULE_ALARM", e.message, e)
        }
    }

    @ReactMethod
    fun cancelAlarm(alarmRequestCode: Int, promise: Promise) {
        try {
            val alarmManager = reactContext.getSystemService(Context.ALARM_SERVICE) as? AlarmManager
            val intent = Intent(reactContext, SmsAlarmReceiver::class.java).apply {
                action = SmsAlarmReceiver.ACTION_SCHEDULED_SMS
            }

            val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE
            } else {
                PendingIntent.FLAG_NO_CREATE
            }

            val pendingIntent = PendingIntent.getBroadcast(
                reactContext,
                alarmRequestCode,
                intent,
                flags
            )

            if (pendingIntent != null && alarmManager != null) {
                alarmManager.cancel(pendingIntent)
                pendingIntent.cancel()
                Log.i(TAG, "Cancelled PendingIntent for alarm code: $alarmRequestCode")
            } else {
                Log.d(TAG, "No active PendingIntent found for alarm code: $alarmRequestCode")
            }

            // Remove from persistent storage
            AlarmStorage.removeAlarm(reactContext, alarmRequestCode)

            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to cancel alarm code: $alarmRequestCode", e)
            promise.reject("ERR_CANCEL_ALARM", e.message, e)
        }
    }

    @ReactMethod
    fun canScheduleExactAlarms(promise: Promise) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val alarmManager = reactContext.getSystemService(Context.ALARM_SERVICE) as? AlarmManager
                promise.resolve(alarmManager?.canScheduleExactAlarms() ?: false)
            } else {
                promise.resolve(true)
            }
        } catch (e: Exception) {
            promise.reject("ERR_CAN_SCHEDULE_EXACT_ALARMS", e.message, e)
        }
    }

    @ReactMethod
    fun requestExactAlarmPermission(promise: Promise) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val intent = Intent(android.provider.Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM).apply {
                    data = android.net.Uri.parse("package:${reactContext.packageName}")
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                reactContext.startActivity(intent)
                promise.resolve(true)
            } else {
                promise.resolve(false)
            }
        } catch (e: Exception) {
            promise.reject("ERR_REQUEST_EXACT_ALARM", e.message, e)
        }
    }

    @ReactMethod
    fun getActiveAlarms(promise: Promise) {
        try {
            val alarms = AlarmStorage.getAllAlarms(reactContext)
            val array = Arguments.createArray()
            for (alarm in alarms) {
                val map = Arguments.createMap().apply {
                    putString("id", alarm.id)
                    putDouble("timestampMs", alarm.timestampMs.toDouble())
                    putInt("alarmRequestCode", alarm.alarmRequestCode)
                    putString("recipientName", alarm.recipientName)
                    putString("phoneNumber", alarm.phoneNumber)
                    putString("messageText", alarm.messageText)
                }
                array.pushMap(map)
            }
            promise.resolve(array)
        } catch (e: Exception) {
            promise.reject("ERR_GET_ACTIVE_ALARMS", e.message, e)
        }
    }

    @ReactMethod
    fun getExecutionLogs(promise: Promise) {
        try {
            val prefs = reactContext.getSharedPreferences("sked_sms_alarms", Context.MODE_PRIVATE)
            val raw = prefs.getString("execution_log", "{}") ?: "{}"
            promise.resolve(raw)
        } catch (e: Exception) {
            promise.reject("ERR_GET_LOGS", e.message, e)
        }
    }

    private fun scheduleAlarmInternal(
        id: String,
        triggerTime: Long,
        alarmRequestCode: Int,
        recipientName: String,
        phoneNumber: String,
        messageText: String
    ) {
        val alarmManager = reactContext.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
        val intent = Intent(reactContext, SmsAlarmReceiver::class.java).apply {
            action = SmsAlarmReceiver.ACTION_SCHEDULED_SMS
            putExtra(SmsAlarmReceiver.EXTRA_SCHEDULE_ID, id)
            putExtra(SmsAlarmReceiver.EXTRA_RECIPIENT_NAME, recipientName)
            putExtra(SmsAlarmReceiver.EXTRA_PHONE_NUMBER, phoneNumber)
            putExtra(SmsAlarmReceiver.EXTRA_MESSAGE_TEXT, messageText)
            putExtra(SmsAlarmReceiver.EXTRA_ALARM_REQUEST_CODE, alarmRequestCode)
        }

        val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        } else {
            PendingIntent.FLAG_UPDATE_CURRENT
        }

        val pendingIntent = PendingIntent.getBroadcast(
            reactContext,
            alarmRequestCode,
            intent,
            flags
        )

        val canScheduleExact = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            alarmManager.canScheduleExactAlarms()
        } else {
            true
        }

        try {
            if (canScheduleExact && Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                alarmManager.setExactAndAllowWhileIdle(
                    AlarmManager.RTC_WAKEUP,
                    triggerTime,
                    pendingIntent
                )
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                Log.w(TAG, "Exact alarm permission not granted; using setAndAllowWhileIdle fallback for $id")
                alarmManager.setAndAllowWhileIdle(
                    AlarmManager.RTC_WAKEUP,
                    triggerTime,
                    pendingIntent
                )
            } else {
                alarmManager.setExact(
                    AlarmManager.RTC_WAKEUP,
                    triggerTime,
                    pendingIntent
                )
            }
        } catch (e: SecurityException) {
            Log.w(TAG, "Exact alarm threw SecurityException for $id; using setAndAllowWhileIdle fallback", e)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                alarmManager.setAndAllowWhileIdle(
                    AlarmManager.RTC_WAKEUP,
                    triggerTime,
                    pendingIntent
                )
            }
        }

        // Mirror into persistent storage for reboot recovery
        AlarmStorage.saveAlarm(
            reactContext,
            AlarmRecord(
                id = id,
                timestampMs = triggerTime,
                alarmRequestCode = alarmRequestCode,
                recipientName = recipientName,
                phoneNumber = phoneNumber,
                messageText = messageText
            )
        )
    }

    private fun parseIsoDate(isoString: String?): java.util.Date? {
        if (isoString.isNullOrBlank()) return null
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            try {
                return java.util.Date.from(java.time.Instant.parse(isoString))
            } catch (_: Exception) {}
        }
        val patterns = arrayOf(
            "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
            "yyyy-MM-dd'T'HH:mm:ss'Z'",
            "yyyy-MM-dd'T'HH:mm:ss.SSSXXX",
            "yyyy-MM-dd'T'HH:mm:ssXXX",
            "yyyy-MM-dd'T'HH:mm:ss"
        )
        for (pattern in patterns) {
            try {
                val sdf = java.text.SimpleDateFormat(pattern, java.util.Locale.US).apply {
                    timeZone = java.util.TimeZone.getTimeZone("UTC")
                }
                val parsed = sdf.parse(isoString)
                if (parsed != null) return parsed
            } catch (_: Exception) {}
        }
        return null
    }

    private fun formatIsoDate(date: java.util.Date): String {
        val sdf = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", java.util.Locale.US).apply {
            timeZone = java.util.TimeZone.getTimeZone("UTC")
        }
        return sdf.format(date)
    }

    @ReactMethod
    fun syncExecutedSchedules(promise: Promise) {
        try {
            val storagePrefs = reactContext.getSharedPreferences("sked_sms_storage", Context.MODE_PRIVATE)
            val rawSchedules = storagePrefs.getString("@sked_sms_schedules_v1", null)
            if (rawSchedules.isNullOrBlank()) {
                promise.resolve(0)
                return
            }

            val alarmPrefs = reactContext.getSharedPreferences("sked_sms_alarms", Context.MODE_PRIVATE)
            val rawLogs = alarmPrefs.getString("execution_log", "{}") ?: "{}"
            val logsJson = JSONObject(rawLogs)

            val array = JSONArray(rawSchedules)
            var updatedCount = 0
            val nowMs = System.currentTimeMillis()
            val nowIso = formatIsoDate(java.util.Date())

            for (i in 0 until array.length()) {
                val item = array.getJSONObject(i)
                val id = item.optString("id", "")
                val status = item.optString("status", "")
                val scheduledAtStr = item.optString("scheduledAt", "")
                val scheduledAtDate = parseIsoDate(scheduledAtStr)
                val scheduledAtMs = scheduledAtDate?.time ?: 0L

                if (status == "pending") {
                    val logEntry = if (logsJson.has(id)) logsJson.optJSONObject(id) else null
                    val wasExecuted = logEntry != null && logEntry.optBoolean("success", false)
                    val isPastDue = scheduledAtMs > 0 && scheduledAtMs < nowMs - 5000

                    if (wasExecuted || isPastDue) {
                        val recurrence = item.optJSONObject("recurrence")
                        val isDaily = recurrence?.optString("type") == "daily"
                        val reqCode = when {
                            item.optInt("alarmRequestCode", 0) > 0 -> item.getInt("alarmRequestCode")
                            else -> id.hashCode() and 0x7FFFFFFF
                        }
                        item.put("alarmRequestCode", reqCode)

                        if (!isDaily) {
                            item.put("status", "sent")
                            item.put("lastSentAt", nowIso)
                            item.put("updatedAt", nowIso)
                            AlarmStorage.removeAlarm(reactContext, reqCode)
                            updatedCount++
                        } else {
                            // Daily recurrence rollover in syncExecutedSchedules
                            val hasEndDate = recurrence?.optBoolean("hasEndDate", false) ?: false
                            val endDateStr = recurrence?.optString("endDate", "")

                            var nextOccurrenceTime = (if (scheduledAtMs > 0) scheduledAtMs else nowMs) + 24 * 60 * 60 * 1000L
                            while (nextOccurrenceTime <= nowMs) {
                                nextOccurrenceTime += 24 * 60 * 60 * 1000L
                            }
                            val nextOccurrenceIso = formatIsoDate(java.util.Date(nextOccurrenceTime))

                            var pastEndDate = false
                            if (hasEndDate && !endDateStr.isNullOrBlank()) {
                                try {
                                    val ymdFormat = java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.US).apply {
                                        timeZone = java.util.TimeZone.getTimeZone("UTC")
                                    }
                                    val endDate = ymdFormat.parse(endDateStr.trim())
                                    if (endDate != null && nextOccurrenceTime > (endDate.time + 24 * 60 * 60 * 1000L - 1L)) {
                                        pastEndDate = true
                                    }
                                } catch (_: Exception) {}
                            }

                            if (pastEndDate) {
                                item.put("status", "completed")
                                item.put("updatedAt", nowIso)
                                if (wasExecuted) item.put("lastSentAt", nowIso)
                                AlarmStorage.removeAlarm(reactContext, reqCode)
                            } else {
                                item.put("status", "pending")
                                item.put("scheduledAt", nextOccurrenceIso)
                                item.put("updatedAt", nowIso)
                                if (wasExecuted) item.put("lastSentAt", nowIso)

                                scheduleAlarmInternal(
                                    id = id,
                                    triggerTime = nextOccurrenceTime,
                                    alarmRequestCode = reqCode,
                                    recipientName = item.optJSONObject("recipient")?.optString("name", "") ?: "",
                                    phoneNumber = item.optJSONObject("recipient")?.optString("phoneNumber", "") ?: "",
                                    messageText = item.optString("messageText", "")
                                )
                            }
                            updatedCount++
                        }
                    }
                }
            }

            if (updatedCount > 0) {
                storagePrefs.edit().putString("@sked_sms_schedules_v1", array.toString()).commit()
                Log.i(TAG, "syncExecutedSchedules updated $updatedCount schedules")
            }
            promise.resolve(updatedCount)
        } catch (e: Exception) {
            promise.reject("ERR_SYNC_SCHEDULES", e.message, e)
        }
    }
}
