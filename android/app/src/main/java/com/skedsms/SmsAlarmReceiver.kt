package com.skedsms

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.PowerManager
import android.telephony.SmsManager
import android.util.Log
import android.app.AlarmManager
import android.app.PendingIntent
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import org.json.JSONArray
import org.json.JSONObject
import com.facebook.react.bridge.Arguments
import com.facebook.react.modules.core.DeviceEventManagerModule

class SmsAlarmReceiver : BroadcastReceiver() {

    companion object {
        const val TAG = "SmsAlarmReceiver"
        const val ACTION_SCHEDULED_SMS = "com.skedsms.ACTION_SCHEDULED_SMS"
        const val EXTRA_SCHEDULE_ID = "scheduleId"
        const val EXTRA_RECIPIENT_NAME = "recipientName"
        const val EXTRA_PHONE_NUMBER = "phoneNumber"
        const val EXTRA_MESSAGE_TEXT = "messageText"
        const val EXTRA_ALARM_REQUEST_CODE = "alarmRequestCode"

        private const val CHANNEL_ID = "sked_sms_dispatches"
        private const val CHANNEL_NAME = "Scheduled SMS Dispatches"
        private const val WAKELOCK_TIMEOUT_MS = 10_000L // 10 seconds safety timeout
    }

    override fun onReceive(context: Context, intent: Intent) {
        Log.i(TAG, "SmsAlarmReceiver triggered with action: ${intent.action}")

        val powerManager = context.getSystemService(Context.POWER_SERVICE) as? PowerManager
        val wakeLock = powerManager?.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK,
            "SkedSMS:SmsAlarmReceiverWakeLock"
        )?.apply {
            setReferenceCounted(false)
            acquire(WAKELOCK_TIMEOUT_MS)
        }

        try {
            val scheduleId = intent.getStringExtra(EXTRA_SCHEDULE_ID)
            val recipientName = intent.getStringExtra(EXTRA_RECIPIENT_NAME) ?: ""
            val phoneNumber = intent.getStringExtra(EXTRA_PHONE_NUMBER)
            val messageText = intent.getStringExtra(EXTRA_MESSAGE_TEXT)
            val alarmRequestCode = intent.getIntExtra(EXTRA_ALARM_REQUEST_CODE, -1)

            if (scheduleId.isNullOrBlank() || phoneNumber.isNullOrBlank() || messageText.isNullOrBlank()) {
                Log.w(TAG, "Missing mandatory intent extras for SMS alarm execution (id=$scheduleId, phone=$phoneNumber)")
                return
            }

            Log.i(TAG, "Executing scheduled SMS for ID: $scheduleId to: $phoneNumber (code: $alarmRequestCode)")

            // Check SEND_SMS permission
            val hasPermission = ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.SEND_SMS
            ) == PackageManager.PERMISSION_GRANTED

            if (!hasPermission) {
                val errorMsg = "SEND_SMS permission not granted; cannot dispatch automated SMS"
                Log.e(TAG, errorMsg)
                AlarmStorage.recordExecution(context, scheduleId, success = false, error = errorMsg)
                val status = updateScheduleStatusInStorage(
                    context = context,
                    scheduleId = scheduleId,
                    success = false,
                    alarmRequestCode = alarmRequestCode,
                    errorMessage = errorMsg
                )
                notifyReactNative(context, scheduleId, status)
                showNotification(
                    context,
                    "SMS Failed: $recipientName",
                    "Missing SMS permissions to send scheduled message."
                )
                return
            }

            // Retrieve SmsManager instance
            val smsManager: SmsManager = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                context.getSystemService(SmsManager::class.java)
            } else {
                @Suppress("DEPRECATION")
                SmsManager.getDefault()
            }

            // Divide message into GSM-7 or UCS-2 parts
            val parts = smsManager.divideMessage(messageText)
            Log.i(TAG, "Message divided into ${parts.size} segment(s)")

            if (parts.size > 1) {
                smsManager.sendMultipartTextMessage(phoneNumber, null, parts, null, null)
            } else {
                smsManager.sendTextMessage(phoneNumber, null, messageText, null, null)
            }

            Log.i(TAG, "Successfully submitted SMS to telephony service for schedule: $scheduleId")

            // Update persistent storage and re-arm recurring daily schedule if applicable
            AlarmStorage.recordExecution(context, scheduleId, success = true)
            val updatedStatus = updateScheduleStatusInStorage(
                context = context,
                scheduleId = scheduleId,
                success = true,
                alarmRequestCode = alarmRequestCode
            )
            notifyReactNative(context, scheduleId, updatedStatus)

            // Post completion notification
            val displayTarget = if (recipientName.isNotBlank()) recipientName else phoneNumber
            showNotification(
                context,
                "SMS Sent",
                "Scheduled message delivered to $displayTarget"
            )

        } catch (e: Exception) {
            Log.e(TAG, "Unexpected error dispatching scheduled SMS", e)
            val scheduleId = intent.getStringExtra(EXTRA_SCHEDULE_ID) ?: "unknown"
            val alarmRequestCode = intent.getIntExtra(EXTRA_ALARM_REQUEST_CODE, -1)
            AlarmStorage.recordExecution(context, scheduleId, success = false, error = e.message)
            val updatedStatus = updateScheduleStatusInStorage(
                context = context,
                scheduleId = scheduleId,
                success = false,
                alarmRequestCode = alarmRequestCode,
                errorMessage = e.message
            )
            notifyReactNative(context, scheduleId, updatedStatus)
            showNotification(
                context,
                "SMS Dispatch Error",
                "Failed to dispatch scheduled SMS: ${e.localizedMessage}"
            )
        } finally {
            try {
                if (wakeLock?.isHeld == true) {
                    wakeLock.release()
                    Log.d(TAG, "WakeLock released successfully")
                }
            } catch (e: Exception) {
                Log.w(TAG, "Error releasing WakeLock: ${e.message}")
            }
        }
    }

    private fun showNotification(context: Context, title: String, body: String) {
        try {
            val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
                ?: return

            // Create notification channel on Android 8.0+
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val channel = NotificationChannel(
                    CHANNEL_ID,
                    CHANNEL_NAME,
                    NotificationManager.IMPORTANCE_DEFAULT
                ).apply {
                    description = "Status notifications for scheduled SMS messages"
                }
                notificationManager.createNotificationChannel(channel)
            }

            val notification = NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentTitle(title)
                .setContentText(body)
                .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                .setAutoCancel(true)
                .build()

            val notificationId = (System.currentTimeMillis() % 100000).toInt()
            notificationManager.notify(notificationId, notification)
        } catch (e: Exception) {
            Log.w(TAG, "Unable to show notification: ${e.message}")
        }
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

    private fun updateScheduleStatusInStorage(
        context: Context,
        scheduleId: String,
        success: Boolean,
        alarmRequestCode: Int = -1,
        errorMessage: String? = null
    ): String {
        var resultStatus = if (success) "sent" else "failed"
        try {
            val prefs = context.getSharedPreferences("sked_sms_storage", Context.MODE_PRIVATE)
            val raw = prefs.getString("@sked_sms_schedules_v1", null) ?: return resultStatus
            val array = JSONArray(raw)
            var modified = false

            val nowIso = formatIsoDate(java.util.Date())

            for (i in 0 until array.length()) {
                val item = array.getJSONObject(i)
                if (item.optString("id") == scheduleId) {
                    val reqCode = when {
                        item.optInt("alarmRequestCode", 0) > 0 -> item.getInt("alarmRequestCode")
                        alarmRequestCode > 0 -> alarmRequestCode
                        else -> scheduleId.hashCode() and 0x7FFFFFFF
                    }
                    item.put("alarmRequestCode", reqCode)

                    if (success) {
                        item.put("lastSentAt", nowIso)
                        item.put("updatedAt", nowIso)

                        val recurrence = item.optJSONObject("recurrence")
                        val isDaily = recurrence?.optString("type") == "daily"
                        if (isDaily) {
                            val hasEndDate = recurrence?.optBoolean("hasEndDate", false) ?: false
                            val endDateStr = recurrence?.optString("endDate", "")

                            val currentScheduledAtStr = item.optString("scheduledAt", "")
                            val currentScheduleDate = parseIsoDate(currentScheduledAtStr) ?: java.util.Date()

                            var nextOccurrenceTime = currentScheduleDate.time + 24 * 60 * 60 * 1000L
                            val nowTime = System.currentTimeMillis()
                            while (nextOccurrenceTime <= nowTime) {
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
                                AlarmStorage.removeAlarm(context, reqCode)
                                resultStatus = "completed"
                            } else {
                                item.put("status", "pending")
                                item.put("scheduledAt", nextOccurrenceIso)
                                resultStatus = "pending"

                                val alarmMgr = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager
                                if (alarmMgr != null) {
                                    val rearmIntent = Intent(context, SmsAlarmReceiver::class.java).apply {
                                        action = ACTION_SCHEDULED_SMS
                                        putExtra(EXTRA_SCHEDULE_ID, scheduleId)
                                        putExtra(EXTRA_RECIPIENT_NAME, item.optJSONObject("recipient")?.optString("name", "") ?: "")
                                        putExtra(EXTRA_PHONE_NUMBER, item.optJSONObject("recipient")?.optString("phoneNumber", "") ?: "")
                                        putExtra(EXTRA_MESSAGE_TEXT, item.optString("messageText", ""))
                                        putExtra(EXTRA_ALARM_REQUEST_CODE, reqCode)
                                    }
                                    val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                                        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                                    } else {
                                        PendingIntent.FLAG_UPDATE_CURRENT
                                    }
                                    val pi = PendingIntent.getBroadcast(context, reqCode, rearmIntent, flags)

                                    try {
                                        val canScheduleExact = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                                            alarmMgr.canScheduleExactAlarms()
                                        } else {
                                            true
                                        }

                                        if (canScheduleExact && Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                                            alarmMgr.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, nextOccurrenceTime, pi)
                                        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                                            alarmMgr.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, nextOccurrenceTime, pi)
                                        } else {
                                            alarmMgr.setExact(AlarmManager.RTC_WAKEUP, nextOccurrenceTime, pi)
                                        }
                                        Log.i(TAG, "Re-armed alarm for recurring schedule $scheduleId at $nextOccurrenceTime (code: $reqCode)")
                                    } catch (e: SecurityException) {
                                        Log.w(TAG, "Exact alarm permission missing; fallback to setAndAllowWhileIdle for $scheduleId", e)
                                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                                            alarmMgr.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, nextOccurrenceTime, pi)
                                        }
                                    } catch (e: Exception) {
                                        Log.e(TAG, "Failed to re-arm alarm in AlarmManager for $scheduleId", e)
                                    }

                                    AlarmStorage.saveAlarm(
                                        context,
                                        AlarmRecord(
                                            id = scheduleId,
                                            timestampMs = nextOccurrenceTime,
                                            alarmRequestCode = reqCode,
                                            recipientName = item.optJSONObject("recipient")?.optString("name", "") ?: "",
                                            phoneNumber = item.optJSONObject("recipient")?.optString("phoneNumber", "") ?: "",
                                            messageText = item.optString("messageText", "")
                                        )
                                    )
                                }
                            }
                        } else {
                            item.put("status", "sent")
                            AlarmStorage.removeAlarm(context, reqCode)
                            resultStatus = "sent"
                        }
                    } else {
                        item.put("status", "failed")
                        item.put("errorMessage", errorMessage ?: "Dispatch failed")
                        item.put("updatedAt", nowIso)
                        AlarmStorage.removeAlarm(context, reqCode)
                        resultStatus = "failed"
                    }
                    modified = true
                    break
                }
            }

            if (modified) {
                prefs.edit().putString("@sked_sms_schedules_v1", array.toString()).commit()
                Log.i(TAG, "Successfully updated schedule $scheduleId status to $resultStatus in sked_sms_storage")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to update schedule in sked_sms_storage", e)
        }
        return resultStatus
    }

    private fun notifyReactNative(context: Context, scheduleId: String, status: String) {
        try {
            val app = context.applicationContext as? MainApplication
            val reactHost = app?.reactHost
            val reactContext = reactHost?.currentReactContext
            if (reactContext != null) {
                val params = Arguments.createMap().apply {
                    putString("scheduleId", scheduleId)
                    putString("status", status)
                }
                reactContext
                    .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                    .emit("onSmsDispatched", params)
                Log.i(TAG, "Emitted onSmsDispatched event to React Native")
            }
        } catch (e: Exception) {
            Log.d(TAG, "React Native context not active or error emitting event: ${e.message}")
        }
    }
}
