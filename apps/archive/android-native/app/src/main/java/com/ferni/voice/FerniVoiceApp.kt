package com.ferni.voice

import android.app.Application

/**
 * Ferni Voice Application class.
 */
class FerniVoiceApp : Application() {

    override fun onCreate() {
        super.onCreate()
        instance = this
    }

    companion object {
        lateinit var instance: FerniVoiceApp
            private set
    }
}
