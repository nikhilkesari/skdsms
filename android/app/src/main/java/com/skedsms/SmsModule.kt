package com.skedsms

import android.Manifest
import android.app.Activity
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.telephony.SmsManager
import android.telephony.TelephonyManager
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger

/**
 * React Native native module bridging to Android telephony SmsManager.
 *
 * Capabilities:
 * - Single-part SMS dispatch (<= 160 GSM-7 / 70 Unicode) via sendTextMessage
 * - Multi-part concatenated SMS dispatch via divideMessage and sendMultipartTextMessage
 * - Thread-safe BroadcastReceiver tracking for sent PendingIntents with timeout watchdog
 * - Carrier error code mapping and ISO 8601 UTC timestamp generation
 * - Telephony hardware and SIM readiness validation via TelephonyManager
 */
class SmsModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val MODULE_NAME = "SmsModule"
        private const val DISPATCH_TIMEOUT_MS = 60_000L // 60 seconds
    }

    private val mainHandler = Handler(Looper.getMainLooper())

    override fun getName(): String = MODULE_NAME

    /**
     * Checks if the device has active telephony hardware and telephony capability.
     * Checks TelephonyManager.getPhoneType() != PHONE_TYPE_NONE and SIM availability.
     */
    @ReactMethod
    fun isAvailable(promise: Promise) {
        try {
            val packageManager = reactContext.packageManager
            val hasTelephonyFeature = packageManager.hasSystemFeature(PackageManager.FEATURE_TELEPHONY)

            val telephonyManager = reactContext.getSystemService(Context.TELEPHONY_SERVICE) as? TelephonyManager
            val phoneType = telephonyManager?.phoneType ?: TelephonyManager.PHONE_TYPE_NONE
            val isPhone = phoneType != TelephonyManager.PHONE_TYPE_NONE

            val simState = telephonyManager?.simState ?: TelephonyManager.SIM_STATE_UNKNOWN
            val hasSim = simState != TelephonyManager.SIM_STATE_ABSENT &&
                         simState != TelephonyManager.SIM_STATE_UNKNOWN

            val available = hasTelephonyFeature && isPhone && hasSim
            promise.resolve(available)
        } catch (e: Exception) {
            promise.resolve(false)
        }
    }

    /**
     * Sends an SMS message to the specified phone number.
     *
     * @param id Unique schedule/message ID
     * @param recipientName Recipient display name
     * @param phoneNumber Normalized recipient phone number
     * @param messageText Content of the SMS message
     * @param promise Resolves with { success: true, messageId: id, partsCount: Int, timestamp: ISO }
     *                or rejects with carrier error code / message
     */
    @ReactMethod
    fun sendSms(
        id: String,
        recipientName: String,
        phoneNumber: String,
        messageText: String,
        promise: Promise
    ) {
        // 1. Argument validation
        if (id.isBlank()) {
            promise.reject("INVALID_ID", "Message ID cannot be blank")
            return
        }
        if (phoneNumber.isBlank()) {
            promise.reject("INVALID_PHONE", "Recipient phone number cannot be blank")
            return
        }
        if (messageText.isBlank()) {
            promise.reject("EMPTY_MESSAGE", "Message text cannot be empty")
            return
        }

        // 2. Permission check
        val permissionGranted = ContextCompat.checkSelfPermission(
            reactContext,
            Manifest.permission.SEND_SMS
        ) == PackageManager.PERMISSION_GRANTED

        if (!permissionGranted) {
            promise.reject(
                "PERMISSION_DENIED",
                "android.permission.SEND_SMS is not granted. Request permission before sending."
            )
            return
        }

        try {
            // 3. Obtain SmsManager (API 31+ vs legacy)
            val smsManager = getSmsManager()

            // 4. Divide message into segments (GSM-7: 160/153, UCS-2: 70/67)
            val parts: ArrayList<String> = smsManager.divideMessage(messageText)
            val partsCount = if (parts.isEmpty()) 1 else parts.size

            // 5. Unique broadcast action for this dispatch attempt
            val sentAction = "com.skedsms.SMS_SENT_${id}_${System.currentTimeMillis()}"

            // 6. State trackers for multipart confirmation
            val totalParts = partsCount
            val receivedParts = AtomicInteger(0)
            val isCompleted = AtomicBoolean(false)
            val hasFailure = AtomicBoolean(false)
            var firstFailureCode = -1
            var firstFailureMessage = ""

            lateinit var receiver: BroadcastReceiver
            lateinit var timeoutRunnable: Runnable

            // Idempotent receiver cleanup & timer cancellation
            val cleanup = {
                if (isCompleted.compareAndSet(false, true)) {
                    mainHandler.removeCallbacks(timeoutRunnable)
                    try {
                        reactContext.unregisterReceiver(receiver)
                    } catch (_: Exception) {
                        // Receiver was already unregistered or never registered
                    }
                }
            }

            // 60-second watchdog runnable
            timeoutRunnable = Runnable {
                if (!isCompleted.get()) {
                    cleanup()
                    promise.reject(
                        "ERR_SMS_TIMEOUT",
                        "SMS dispatch timed out waiting for carrier network confirmation"
                    )
                }
            }

            // 7. Dynamic BroadcastReceiver for sent PendingIntent callbacks
            receiver = object : BroadcastReceiver() {
                override fun onReceive(context: Context?, intent: Intent?) {
                    val code = resultCode
                    val currentCount = receivedParts.incrementAndGet()

                    if (code != Activity.RESULT_OK) {
                        if (hasFailure.compareAndSet(false, true)) {
                            firstFailureCode = code
                            firstFailureMessage = getCarrierErrorMessage(code, intent)
                        }
                    }

                    // Once all parts report back, conclude the dispatch
                    if (currentCount >= totalParts) {
                        cleanup()
                        if (hasFailure.get()) {
                            promise.reject(
                                getCarrierErrorCodeString(firstFailureCode),
                                firstFailureMessage
                            )
                        } else {
                            val resultMap: WritableMap = Arguments.createMap().apply {
                                putBoolean("success", true)
                                putString("messageId", id)
                                putInt("partsCount", totalParts)
                                putString("timestamp", getIsoTimestamp())
                            }
                            promise.resolve(resultMap)
                        }
                    }
                }
            }

            // 8. Register receiver with Android 14 export compliance
            val filter = IntentFilter(sentAction)
            ContextCompat.registerReceiver(
                reactContext,
                receiver,
                filter,
                ContextCompat.RECEIVER_EXPORTED
            )

            // Post timeout watchdog
            mainHandler.postDelayed(timeoutRunnable, DISPATCH_TIMEOUT_MS)

            // 9. PendingIntent flags for Android 12+ (API 31+)
            val pendingIntentFlags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            } else {
                PendingIntent.FLAG_UPDATE_CURRENT
            }

            // 10. Dispatch SMS (Single-part vs Multi-part)
            if (partsCount <= 1) {
                val sentIntent = PendingIntent.getBroadcast(
                    reactContext,
                    0,
                    Intent(sentAction).apply { setPackage(reactContext.packageName) },
                    pendingIntentFlags
                )
                smsManager.sendTextMessage(
                    phoneNumber,
                    null,
                    messageText,
                    sentIntent,
                    null
                )
            } else {
                val sentIntents = ArrayList<PendingIntent>(partsCount)
                for (i in 0 until partsCount) {
                    val partIntent = Intent(sentAction).apply {
                        setPackage(reactContext.packageName)
                        putExtra("partIndex", i)
                    }
                    sentIntents.add(
                        PendingIntent.getBroadcast(
                            reactContext,
                            i,
                            partIntent,
                            pendingIntentFlags
                        )
                    )
                }
                smsManager.sendMultipartTextMessage(
                    phoneNumber,
                    null,
                    parts,
                    sentIntents,
                    null
                )
            }
        } catch (e: Exception) {
            promise.reject(
                "ERR_SMS_DISPATCH",
                e.message ?: "Failed to dispatch SMS through SmsManager",
                e
            )
        }
    }

    /**
     * Retrieves the SmsManager instance appropriate for the running OS level.
     * Android 12 (API 31+) mandates Context.getSystemService(SmsManager.class).
     */
    @Suppress("DEPRECATION")
    private fun getSmsManager(): SmsManager {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            reactContext.getSystemService(SmsManager::class.java)
                ?: SmsManager.getDefault()
        } else {
            SmsManager.getDefault()
        }
    }

    /**
     * Returns an ISO 8601 UTC timestamp string: YYYY-MM-DDTHH:mm:ss.sssZ.
     */
    private fun getIsoTimestamp(): String {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            java.time.Instant.now().toString()
        } else {
            val sdf = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
            sdf.timeZone = TimeZone.getTimeZone("UTC")
            sdf.format(Date())
        }
    }

    /**
     * Translates integer SmsManager result codes to human-readable error descriptions.
     */
    private fun getCarrierErrorMessage(resultCode: Int, intent: Intent?): String {
        val carrierErrorCode = intent?.getIntExtra("errorCode", -1) ?: -1
        val baseMessage = when (resultCode) {
            Activity.RESULT_OK -> "Success"
            SmsManager.RESULT_ERROR_GENERIC_FAILURE -> "Generic carrier failure (RESULT_ERROR_GENERIC_FAILURE)"
            SmsManager.RESULT_ERROR_RADIO_OFF -> "Cellular radio is turned off or device is in Airplane Mode (RESULT_ERROR_RADIO_OFF)"
            SmsManager.RESULT_ERROR_NULL_PDU -> "Null PDU provided (RESULT_ERROR_NULL_PDU)"
            SmsManager.RESULT_ERROR_NO_SERVICE -> "No cellular service or out of coverage area (RESULT_ERROR_NO_SERVICE)"
            SmsManager.RESULT_ERROR_LIMIT_EXCEEDED -> "SMS transmission limit exceeded (RESULT_ERROR_LIMIT_EXCEEDED)"
            SmsManager.RESULT_ERROR_FDN_CHECK_FAILURE -> "Fixed Dialing Numbers (FDN) check failure (RESULT_ERROR_FDN_CHECK_FAILURE)"
            SmsManager.RESULT_ERROR_SHORT_CODE_NOT_ALLOWED -> "Sending to short code not allowed (RESULT_ERROR_SHORT_CODE_NOT_ALLOWED)"
            SmsManager.RESULT_ERROR_SHORT_CODE_NEVER_ALLOWED -> "Sending to short code never allowed (RESULT_ERROR_SHORT_CODE_NEVER_ALLOWED)"
            else -> "SMS transmission failed with resultCode: $resultCode"
        }
        return if (carrierErrorCode > 0) {
            "$baseMessage (carrier internal error code: $carrierErrorCode)"
        } else {
            baseMessage
        }
    }

    /**
     * Translates integer SmsManager result codes to symbolic error code strings.
     */
    private fun getCarrierErrorCodeString(resultCode: Int): String {
        return when (resultCode) {
            SmsManager.RESULT_ERROR_GENERIC_FAILURE -> "RESULT_ERROR_GENERIC_FAILURE"
            SmsManager.RESULT_ERROR_RADIO_OFF -> "RESULT_ERROR_RADIO_OFF"
            SmsManager.RESULT_ERROR_NULL_PDU -> "RESULT_ERROR_NULL_PDU"
            SmsManager.RESULT_ERROR_NO_SERVICE -> "RESULT_ERROR_NO_SERVICE"
            SmsManager.RESULT_ERROR_LIMIT_EXCEEDED -> "RESULT_ERROR_LIMIT_EXCEEDED"
            SmsManager.RESULT_ERROR_FDN_CHECK_FAILURE -> "RESULT_ERROR_FDN_CHECK_FAILURE"
            SmsManager.RESULT_ERROR_SHORT_CODE_NOT_ALLOWED -> "RESULT_ERROR_SHORT_CODE_NOT_ALLOWED"
            SmsManager.RESULT_ERROR_SHORT_CODE_NEVER_ALLOWED -> "RESULT_ERROR_SHORT_CODE_NEVER_ALLOWED"
            else -> "SMS_ERROR_$resultCode"
        }
    }
}
