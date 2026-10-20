@echo off
setlocal enabledelayedexpansion

echo ====================================================
echo   TaksideOde Android APK ve AAB Uretim Araci
echo ====================================================

set "JAVA_HOME=C:\Users\dogud\Downloads\Taksi\jdk17\jdk-17.0.12+7"

set "ANDROID_HOME=C:\Users\dogud\AppData\Local\Android\Sdk"
set "PATH=%JAVA_HOME%\bin;%ANDROID_HOME%\platform-tools;%PATH%"

set "GRADLE_BAT=C:\Users\dogud\.gradle\wrapper\dists\gradle-8.10.2-all\7iv73wktx1xtkvlq19urqw1wm\gradle-8.10.2\bin\gradle.bat"

cd /d "C:\Users\dogud\Downloads\Taksi\android"

echo [1/4] Android Imzali APK Olusturuluyor (assembleRelease)...
call "%GRADLE_BAT%" assembleRelease --no-daemon
if errorlevel 1 (
    echo [HATA] APK derlenirken bir sorun olustu.
    exit /b 1
)

echo [2/4] Android Google Play AAB Olusturuluyor (bundleRelease)...
call "%GRADLE_BAT%" bundleRelease --no-daemon
if errorlevel 1 (
    echo [HATA] AAB derlenirken bir sorun olustu.
    exit /b 1
)

echo [3/4] Cikti dosyalari kopyalaniyor...
if not exist "C:\Users\dogud\Downloads\Taksi\android_outputs" mkdir "C:\Users\dogud\Downloads\Taksi\android_outputs"

copy /Y "app\build\outputs\apk\release\app-release.apk" "C:\Users\dogud\Downloads\Taksi\android_outputs\TaksideOde_POS_v1.0.apk"
copy /Y "app\build\outputs\bundle\release\app-release.aab" "C:\Users\dogud\Downloads\Taksi\android_outputs\TaksideOde_POS_v1.0.aab"
copy /Y "app\build\outputs\bundle\release\app-release.aab" "C:\Users\dogud\Downloads\Taksi\android_outputs\TaksideOde_POS_GooglePlay_Release.aab"

echo [4/4] Bagli telefona APK yukleniyor ve aciliyor...
adb reverse tcp:3000 tcp:3000
adb install -r "C:\Users\dogud\Downloads\Taksi\android_outputs\TaksideOde_POS_v1.0.apk"
adb shell am start -n taksideode.com/com.taksideode.pos.MainActivity

echo ====================================================
echo   TEBRIKLER! Google Play Imzali AAB ve APK Basariyla Uretildi!
echo   Google Play AAB: C:\Users\dogud\Downloads\Taksi\android_outputs\TaksideOde_POS_GooglePlay_Release.aab
echo   Standart AAB:    C:\Users\dogud\Downloads\Taksi\android_outputs\TaksideOde_POS_v1.0.aab
echo   Yuklenebilir APK: C:\Users\dogud\Downloads\Taksi\android_outputs\TaksideOde_POS_v1.0.apk
echo ====================================================
