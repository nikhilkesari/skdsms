package com.skedsms

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.PowerManager
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject

class BootReceiver : BroadcastReceiver() {

    companion object {
        const val TAG = "BootReceiver"
        private const val WAKELOCK_TIMEOUT_MS = 10_000L
    }

    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action
        Log.i(TAG, "BootReceiver received action: $action")

        val validActions = setOf(
            Intent.ACTION_BOOT_COMPLETED,
            Intent.ACTION_MY_PACKAGE_REPLACED,
            Intent.ACTION_TIMEZONE_CHANGED,
            Intent.ACTION_TIME_CHANGED,
            "android.intent.action.QUICKBOOT_POWERON",
            "com.htc.intent.action.QUICKBOOT_POWERON"
        )

        if (!validActions.contains(action)) {
            Log.d(TAG, "Ignoring unrecognized action: $action")
            return
        }

        val powerManager = context.getSystemService(Context.POWER_SERVICE) as? PowerManager
        val wakeLock = powerManager?.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK,
            "SkedSMS:BootReceiverWakeLock"
        )?.apply {
            setReferenceCounted(false)
            acquire(WAKELOCK_TIMEOUT_MS)
        }

        try {
            val alarms = AlarmStorage.getAllAlarms(context)
            Log.i(TAG, "Found ${alarms.size} total alarms in persistent storage to re-evaluate")

            if (alarms.isEmpty()) {
                Log.d(TAG, "No active alarms found to restore")
                return
            }

            val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager
            if (alarmManager == null) {
                Log.e(TAG, "AlarmManager system service unavailable; cannot re-register alarms")
                return
            }

            val now = System.currentTimeMillis()
            var rearmedCount = 0
            var expiredCount = 0

            for (alarm in alarms) {
                if (alarm.timestampMs > now) {
                    armAlarm(context, alarmManager, alarm, alarm.timestampMs)
                    rearmedCount++
                    Log.i(TAG, "Re-armed alarm for schedule ${alarm.id} (code: ${alarm.alarmRequestCode}) at ${alarm.timestampMs}")
                } else {
                    val rolledOver = tryRolloverDailyScheduleOnBoot(context, alarmManager, alarm, now)
                    if (rolledOver) {
                        rearmedCount++
                        Log.i(TAG, "Rolled over daily schedule ${alarm.id} to future occurrence on boot")
                    } else {
                        expiredCount++
                        Log.w(TAG, "Schedule ${alarm.id} expired while device was powered off (scheduled: ${alarm.timestampMs}, now: $now)")
                        AlarmStorage.removeAlarm(context, alarm.alarmRequestCode)
                        AlarmStorage.recordExecution(
                            context,
                            alarm.id,
                            success = false,
                            error = "Device powered off during scheduled trigger window"
                        )
                    }
                }
            }

            Log.i(TAG, "Boot restoration complete. Re-armed: $rearmedCount, Expired: $expiredCount")

        } catch (e: Exception) {
            Log.e(TAG, "Error restoring alarms on boot", e)
        } finally {
            try {
                if (wakeLock?.isHeld == true) {
                    wakeLock.release()
                    Log.d(TAG, "BootReceiver WakeLock released successfully")
                }
            } catch (e: Exception) {
                Log.w(TAG, "Error releasing WakeLock: ${e.message}")
            }
        }
    }

    private fun armAlarm(context: Context, alarmManager: AlarmManager, alarm: AlarmRecord, triggerTime: Long) {
        val alarmIntent = Intent(context, SmsAlarmReceiver::class.java).apply {
            this.action = SmsAlarmReceiver.ACTION_SCHEDULED_SMS
            putExtra(SmsAlarmReceiver.EXTRA_SCHEDULE_ID, alarm.id)
            putExtra(SmsAlarmReceiver.EXTRA_RECIPIENT_NAME, alarm.recipientName)
            putExtra(SmsAlarmReceiver.EXTRA_PHONE_NUMBER, alarm.phoneNumber)
            putExtra(SmsAlarmReceiver.EXTRA_MESSAGE_TEXT, alarm.messageText)
            putExtra(SmsAlarmReceiver.EXTRA_ALARM_REQUEST_CODE, alarm.alarmRequestCode)
        }

        val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        } else {
            PendingIntent.FLAG_UPDATE_CURRENT
        }

        val pendingIntent = PendingIntent.getBroadcast(
            context,
            alarm.alarmRequestCode,
            alarmIntent,
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
                Log.w(TAG, "Exact alarm permission not granted; using setAndAllowWhileIdle fallback for ${alarm.id}")
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
            Log.w(TAG, "Exact alarm threw SecurityException for ${alarm.id}; using setAndAllowWhileIdle fallback", e)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                alarmManager.setAndAllowWhileIdle(
                    AlarmManager.RTC_WAKEUP,
                    triggerTime,
                    pendingIntent
                )
            }
        }
    }

    private fun tryRolloverDailyScheduleOnBoot(
        context: Context,
        alarmManager: AlarmManager,
        alarm: AlarmRecord,
        now: Long
    ): Boolean {
        try {
            val prefs = context.getSharedPreferences("sked_sms_storage", Context.MODE_PRIVATE)
            val raw = prefs.getString("@sked_sms_schedules_v1", null) ?: return false
            val array = JSONArray(raw)

            for (i in 0 until array.length()) {
                val item = array.getJSONObject(i)
                if (item.optString("id") == alarm.id) {
                    val recurrence = item.optJSONObject("recurrence")
                    val isDaily = recurrence?.optString("type") == "daily"
                    if (!isDaily) return false

                    val hasEndDate = recurrence?.optBoolean("hasEndDate", false) ?: false
                    val endDateStr = recurrence?.optString("endDate", "")

                    var nextOccurrenceTime = alarm.timestampMs + 24 * 60 * 60 * 1000L
                    while (nextOccurrenceTime <= now) {
                        nextOccurrenceTime += 24 * 60 * 60 * 1000L
                    }

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

                    val nowFormat = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", java.util.Locale.US).apply {
                        timeZone = java.util.TimeZone.getTimeZone("UTC")
                    }
                    val nowIso = nowFormat.format(java.util.Date())

                    if (pastEndDate) {
                        item.put("status", "completed")
                        item.put("updatedAt", nowIso)
                        prefs.edit().putString("@sked_sms_schedules_v1", array.toString()).commit()
                        AlarmStorage.removeAlarm(context, alarm.alarmRequestCode)
                        return false
                    } else {
                        val nextOccurrenceIso = nowFormat.format(java.util.Date(nextOccurrenceTime))
                        item.put("status", "pending")
                        item.put("scheduledAt", nextOccurrenceIso)
                        item.put("updatedAt", nowIso)
                        prefs.edit().putString("@sked_sms_schedules_v1", array.toString()).commit()

                        val updatedAlarm = alarm.copy(timestampMs = nextOccurrenceTime)
                        armAlarm(context, alarmManager, updatedAlarm, nextOccurrenceTime)
                        AlarmStorage.saveAlarm(context, updatedAlarm)
                        return true
                    }
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error checking daily recurrence during boot for ${alarm.id}", e)
        }
        return false
    }
}
