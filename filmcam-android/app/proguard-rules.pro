# CameraX and Compose ship their own consumer rules; nothing app-specific is reflected on.

# MediaPipe (subject segmentation) calls into Java from native code and reads its options
# through protobuf reflection: keep both whole.
-keep class com.google.mediapipe.** { *; }
-keep class com.google.protobuf.** { *; }
# MediaPipe logs through Flogger, which finds its backend by class name
# (com.google.common.flogger.backend.system.DefaultPlatform): renamed, every MediaPipe call
# fails with ExceptionInInitializerError.
-keep class com.google.common.flogger.** { *; }
-dontwarn com.google.common.flogger.**
-dontwarn com.google.mediapipe.**
-dontwarn com.google.protobuf.**
-dontwarn com.google.auto.value.**
-dontwarn javax.lang.model.**
-dontwarn javax.annotation.**
