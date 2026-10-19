# Ferni Voice Android - ProGuard Rules

# Keep LiveKit classes
-keep class io.livekit.** { *; }
-keep class livekit.** { *; }

# Keep WebRTC classes
-keep class org.webrtc.** { *; }

# Keep Kotlin serialization
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.AnnotationsKt

-keepclassmembers class kotlinx.serialization.json.** {
    *** Companion;
}
-keepclasseswithmembers class kotlinx.serialization.json.** {
    kotlinx.serialization.KSerializer serializer(...);
}

# Keep data classes for serialization
-keep class com.ferni.voice.models.** { *; }
-keep class com.ferni.voice.services.TokenResponse { *; }

# OkHttp
-dontwarn okhttp3.**
-dontwarn okio.**
-keep class okhttp3.** { *; }

# Coroutines
-keepnames class kotlinx.coroutines.internal.MainDispatcherFactory {}
-keepnames class kotlinx.coroutines.CoroutineExceptionHandler {}

# Keep Compose runtime
-keep class androidx.compose.** { *; }
