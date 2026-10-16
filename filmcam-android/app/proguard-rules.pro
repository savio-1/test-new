# CameraX and Compose ship their own consumer rules; nothing app-specific is reflected on.

# MediaPipe (subject segmentation) calls into Java from native code and reads its options
# through protobuf reflection: keep both whole.
-keep class com.google.mediapipe.** { *; }
-keep class com.google.protobuf.** { *; }
-dontwarn com.google.mediapipe.**
-dontwarn com.google.protobuf.**
-dontwarn com.google.auto.value.**
-dontwarn javax.lang.model.**
-dontwarn javax.annotation.**
