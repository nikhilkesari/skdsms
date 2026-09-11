package com.skedsms

import android.app.Application
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeHost
import com.facebook.react.ReactPackage
import com.facebook.react.defaults.DefaultReactHost
import com.facebook.react.defaults.DefaultReactNativeHost
import com.facebook.react.shell.MainReactPackage
import com.facebook.soloader.SoLoader

/**
 * MainApplication entry point registering React Native packages including SmsPackage, AlarmSchedulerPackage, and ContactPickerPackage.
 * Employs safe reflection lookup for autolinked PackageList with graceful fallback.
 */
class MainApplication : Application(), ReactApplication {

    override val reactNativeHost: ReactNativeHost = object : DefaultReactNativeHost(this@MainApplication) {
        override fun getUseDeveloperSupport(): Boolean = BuildConfig.DEBUG

        override fun getPackages(): List<ReactPackage> {
            val packages = mutableListOf<ReactPackage>()
            try {
                // Attempt to load autolinked PackageList generated during gradle build
                val packageListClass = Class.forName("com.facebook.react.PackageList")
                val constructor = packageListClass.getConstructor(Application::class.java)
                val packageListInstance = constructor.newInstance(this@MainApplication)
                val getPackagesMethod = packageListClass.getMethod("getPackages")
                @Suppress("UNCHECKED_CAST")
                val autolinkedPackages = getPackagesMethod.invoke(packageListInstance) as List<ReactPackage>
                packages.addAll(autolinkedPackages)
            } catch (_: Exception) {
                // Fallback to core MainReactPackage when autolinking is not generated
                packages.add(MainReactPackage())
            }

            // Ensure SmsPackage is registered
            if (packages.none { it is SmsPackage }) {
                packages.add(SmsPackage())
            }

            // Ensure AlarmSchedulerPackage is registered
            if (packages.none { it is AlarmSchedulerPackage }) {
                packages.add(AlarmSchedulerPackage())
            }

            // Ensure ContactPickerPackage is registered
            if (packages.none { it is ContactPickerPackage }) {
                packages.add(ContactPickerPackage())
            }

            return packages
        }

        override fun getJSMainModuleName(): String = "index"
    }

    override val reactHost: ReactHost
        get() = DefaultReactHost.getDefaultReactHost(applicationContext, reactNativeHost)

    override fun onCreate() {
        super.onCreate()
        try {
            com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative(this)
        } catch (_: Throwable) {
            try {
                SoLoader.init(this, com.facebook.react.soloader.OpenSourceMergedSoMapping)
            } catch (_: Throwable) {
                SoLoader.init(this, false)
            }
        }
    }
}
