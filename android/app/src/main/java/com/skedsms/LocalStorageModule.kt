package com.skedsms

import android.content.Context
import android.content.SharedPreferences
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * High-performance, persistent key-value storage backed by Android SharedPreferences.
 * Provides guaranteed local persistence for schedules and settings without external dependencies.
 */
class LocalStorageModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private val prefs: SharedPreferences by lazy {
        reactContext.getSharedPreferences("sked_sms_storage", Context.MODE_PRIVATE)
    }

    override fun getName(): String = "LocalStorageModule"

    @ReactMethod
    fun getItem(key: String, promise: Promise) {
        try {
            val value = prefs.getString(key, null)
            promise.resolve(value)
        } catch (e: Exception) {
            promise.reject("ERR_GET_ITEM", e.message, e)
        }
    }

    @ReactMethod
    fun setItem(key: String, value: String, promise: Promise) {
        try {
            prefs.edit().putString(key, value).apply()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERR_SET_ITEM", e.message, e)
        }
    }

    @ReactMethod
    fun removeItem(key: String, promise: Promise) {
        try {
            prefs.edit().remove(key).apply()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERR_REMOVE_ITEM", e.message, e)
        }
    }

    @ReactMethod
    fun clear(promise: Promise) {
        try {
            prefs.edit().clear().apply()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERR_CLEAR", e.message, e)
        }
    }
}
