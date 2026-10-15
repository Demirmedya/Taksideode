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

echo [1/4] Android APK Olusturuluyor (assembleDebug)...
call "%GRADLE_BAT%" assembleDebug --no-daemon
if errorlevel 1 (
    echo [HATA] APK derlenirken bir sorun olustu.
    exit /b 1
)

echo [2/4] Android App Bundle (AAB) Olusturuluyor (bundleDebug)...
call "%GRADLE_BAT%" bundleDebug --no-daemon
if errorlevel 1 (
    echo [HATA] AAB derlenirken bir sorun olustu.
    exit /b 1
)

echo [3/4] Cikti dosyalari kopyalaniyor...
if not exist "C:\Users\dogud\Downloads\Taksi\android_outputs" mkdir "C:\Users\dogud\Downloads\Taksi\android_outputs"

copy /Y "app\build\outputs\apk\debug\app-debug.apk" "C:\Users\dogud\Downloads\Taksi\android_outputs\TaksideOde_POS_v1.0.apk"
copy /Y "app\build\outputs\bundle\debug\app-debug.aab" "C:\Users\dogud\Downloads\Taksi\android_outputs\TaksideOde_POS_v1.0.aab"

echo [4/4] Bagli telefona APK yukleniyor ve aciliyor...
adb reverse tcp:3000 tcp:3000
adb install -r "C:\Users\dogud\Downloads\Taksi\android_outputs\TaksideOde_POS_v1.0.apk"
adb shell am start -n com.taksideode.pos/.MainActivity

echo ====================================================
echo   TEBRIKLER! APK ve AAB Basariyla Uretildi ve Telefona Kuruldu!
echo   APK: C:\Users\dogud\Downloads\Taksi\android_outputs\TaksideOde_POS_v1.0.apk
echo   AAB: C:\Users\dogud\Downloads\Taksi\android_outputs\TaksideOde_POS_v1.0.aab
echo ====================================================
