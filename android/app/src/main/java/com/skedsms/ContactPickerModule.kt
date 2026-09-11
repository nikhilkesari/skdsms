package com.skedsms

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.provider.ContactsContract
import com.facebook.react.bridge.*

/**
 * ContactPickerModule allows selecting a contact from the device's native contact picker.
 * Launches Intent.ACTION_PICK on ContactsContract.CommonDataKinds.Phone.CONTENT_URI.
 */
class ContactPickerModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), ActivityEventListener {

    private var mPickerPromise: Promise? = null

    init {
        reactContext.addActivityEventListener(this)
    }

    override fun getName(): String = "ContactPickerModule"

    @ReactMethod
    fun pickContact(promise: Promise) {
        val act = reactApplicationContext.currentActivity
        if (act == null) {
            promise.reject("E_ACTIVITY_DOES_NOT_EXIST", "Activity doesn't exist")
            return
        }

        if (mPickerPromise != null) {
            promise.reject("E_CONTACT_PICKER_BUSY", "Contact picker is already active")
            return
        }

        mPickerPromise = promise

        try {
            val contactPickerIntent = Intent(
                Intent.ACTION_PICK,
                ContactsContract.CommonDataKinds.Phone.CONTENT_URI
            )
            act.startActivityForResult(contactPickerIntent, REQUEST_CODE_PICK_CONTACT)
        } catch (e: Exception) {
            mPickerPromise?.reject("E_FAILED_TO_OPEN_PICKER", e.message, e)
            mPickerPromise = null
        }
    }

    override fun onActivityResult(
        activity: Activity,
        requestCode: Int,
        resultCode: Int,
        data: Intent?
    ) {
        if (requestCode != REQUEST_CODE_PICK_CONTACT) {
            return
        }

        val promise = mPickerPromise ?: return
        mPickerPromise = null

        if (resultCode != Activity.RESULT_OK || data == null) {
            promise.reject("E_CONTACT_PICKER_CANCELLED", "Contact selection was cancelled")
            return
        }

        val contactUri: Uri? = data.data
        if (contactUri == null) {
            promise.reject("E_NO_CONTACT_DATA", "No contact data returned")
            return
        }

        try {
            val context = reactApplicationContext
            val cursor = context.contentResolver.query(
                contactUri,
                arrayOf(
                    ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
                    ContactsContract.CommonDataKinds.Phone.NUMBER
                ),
                null,
                null,
                null
            )

            cursor?.use {
                if (it.moveToFirst()) {
                    val nameIndex = it.getColumnIndex(ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME)
                    val numberIndex = it.getColumnIndex(ContactsContract.CommonDataKinds.Phone.NUMBER)

                    val displayName = if (nameIndex >= 0) it.getString(nameIndex) ?: "" else ""
                    val phoneNumber = if (numberIndex >= 0) it.getString(numberIndex) ?: "" else ""

                    val resultMap = Arguments.createMap().apply {
                        putString("displayName", displayName)
                        putString("phoneNumber", phoneNumber)
                    }
                    promise.resolve(resultMap)
                    return
                }
            }

            promise.reject("E_CONTACT_NOT_FOUND", "Could not read contact details")
        } catch (e: Exception) {
            promise.reject("E_QUERY_CONTACT_FAILED", e.message, e)
        }
    }

    override fun onNewIntent(intent: Intent) {
        // No-op
    }

    companion object {
        private const val REQUEST_CODE_PICK_CONTACT = 42109
    }
}
