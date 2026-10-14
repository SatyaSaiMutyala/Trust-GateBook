package com.app.gatebook

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          // Packages that cannot be autolinked yet can be added manually here, for example:
          // add(MyReactNativePackage())
        },
    )
  }

  override fun onCreate() {
    super.onCreate()
    createNotificationChannel()
    loadReactNative(this)
  }

  /**
   * FCM messages from the backend target the `gatebook_default` channel (see AndroidManifest meta-data).
   * Channels must exist before a notification is posted, so create it at startup (Android 8+).
   */
  private fun createNotificationChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = getSystemService(NotificationManager::class.java) ?: return
    val channel =
      NotificationChannel(
        getString(R.string.default_notification_channel_id),
        getString(R.string.default_notification_channel_name),
        NotificationManager.IMPORTANCE_HIGH,
      )
    channel.description = "Post for you, reminders and collection issues"
    channel.enableVibration(true)
    manager.createNotificationChannel(channel)
  }
}
