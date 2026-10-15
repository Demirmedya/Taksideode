package com.taksideode.pos;

import android.annotation.SuppressLint;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.media.AudioAttributes;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.IBinder;
import android.os.PowerManager;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.util.Log;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

public class PosForegroundService extends Service implements LocationListener {

    private static final String TAG = "PosForegroundService";
    private static final String CHANNEL_ID = "taksideode_pos_service_channel";
    private static final String ALARM_CHANNEL_ID = "taksideode_pos_alarm_channel";
    private static final int NOTIFICATION_ID = 999;
    private static final int ALARM_NOTIFICATION_ID = 888;

    private static final String SERVER_URL = "http://192.168.1.102:3000/api/drivers/location";
    private String currentShiftId = "sh_1";

    private LocationManager locationManager;
    private PowerManager.WakeLock wakeLock;
    private Vibrator vibrator;
    private Ringtone alarmRingtone;

    @Override
    public void onCreate() {
        super.onCreate();
        vibrator = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
        acquireWakeLock();
        createNotificationChannels();
        startForegroundNotification();
        startLocationUpdates();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null) {
            String shiftId = intent.getStringExtra("shiftId");
            if (shiftId != null && !shiftId.isEmpty()) {
                currentShiftId = shiftId;
            }

            String action = intent.getAction();
            if ("PLAY_ALARM".equals(action)) {
                String address = intent.getStringExtra("address");
                triggerCallAlarm(address != null ? address : "Yeni Müşteri Çağrısı");
            } else if ("STOP_ALARM".equals(action)) {
                stopCallAlarm();
            }
        }
        return START_STICKY;
    }

    private void acquireWakeLock() {
        try {
            PowerManager powerManager = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (powerManager != null) {
                wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "TaksideOde:PosBackgroundLock");
                wakeLock.acquire();
            }
        } catch (Exception e) {
            Log.e(TAG, "WakeLock error", e);
        }
    }

    private void createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager == null) return;

            // 1. Canlı Arka Plan Servis Kanalı (Sessiz, Sürekli Bildirim)
            NotificationChannel serviceChannel = new NotificationChannel(
                    CHANNEL_ID,
                    "TaksideÖde POS Canlı Takip",
                    NotificationManager.IMPORTANCE_LOW
            );
            serviceChannel.setDescription("Durak GPS ve telsiz bağlantısını arka planda aktif tutar");
            manager.createNotificationChannel(serviceChannel);

            // 2. Acil Çağrı / Alarm Kanalı (Yüksek Öncelik, Ses + Titreşim)
            NotificationChannel alarmChannel = new NotificationChannel(
                    ALARM_CHANNEL_ID,
                    "TaksideÖde Acil İş Emirleri",
                    NotificationManager.IMPORTANCE_HIGH
            );
            alarmChannel.setDescription("Yeni çağrı geldiğinde çalan siren ve bildirim");
            alarmChannel.enableVibration(true);
            alarmChannel.setVibrationPattern(new long[]{0, 800, 300, 800, 300, 800});
            manager.createNotificationChannel(alarmChannel);
        }
    }

    private void startForegroundNotification() {
        Intent notificationIntent = new Intent(this, MainActivity.class);
        notificationIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pendingIntent = PendingIntent.getActivity(
                this, 0, notificationIntent,
                Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0
        );

        Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("🚖 TaksideÖde POS Terminali Aktif")
                .setContentText("Durak telsizi ve canlı GPS arka planda kesintisiz çalışıyor")
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentIntent(pendingIntent)
                .setOngoing(true)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .build();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
    }

    @SuppressLint("MissingPermission")
    private void startLocationUpdates() {
        locationManager = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
        if (locationManager == null) return;

        try {
            if (locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                locationManager.requestLocationUpdates(LocationManager.GPS_PROVIDER, 4000, 2.0f, this);
            }
            if (locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                locationManager.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 4000, 2.0f, this);
            }
        } catch (Exception e) {
            Log.e(TAG, "Location listener register error", e);
        }
    }

    @Override
    public void onLocationChanged(@NonNull Location location) {
        final double lat = location.getLatitude();
        final double lng = location.getLongitude();

        // Arka plan iş parçacığında durağa ilet
        new Thread(() -> {
            try {
                URL url = new URL(SERVER_URL);
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("POST");
                conn.setRequestProperty("Content-Type", "application/json");
                conn.setConnectTimeout(4000);
                conn.setReadTimeout(4000);
                conn.setDoOutput(true);

                String json = "{\"shiftId\":\"" + currentShiftId + "\",\"lat\":" + lat + ",\"lng\":" + lng + "}";
                try (OutputStream os = conn.getOutputStream()) {
                    os.write(json.getBytes(StandardCharsets.UTF_8));
                }
                int code = conn.getResponseCode();
                conn.disconnect();
                Log.d(TAG, "Location sent to server: " + code);
            } catch (Exception e) {
                Log.w(TAG, "Failed to send location: " + e.getMessage());
            }
        }).start();
    }

    @Override
    public void onStatusChanged(String provider, int status, Bundle extras) {}

    @Override
    public void onProviderEnabled(@NonNull String provider) {}

    @Override
    public void onProviderDisabled(@NonNull String provider) {}

    // Yeni İş Emri Geldiğinde Arka Planda Siren ve Titreşim Çal
    public void triggerCallAlarm(String address) {
        // 1. Ekranı uyandır
        try {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm != null) {
                @SuppressLint("InvalidWakeLockTag")
                PowerManager.WakeLock screenLock = pm.newWakeLock(
                        PowerManager.FULL_WAKE_LOCK | PowerManager.ACQUIRE_CAUSES_WAKEUP | PowerManager.ON_AFTER_RELEASE,
                        "TaksideOde:ScreenWake"
                );
                screenLock.acquire(10000);
            }
        } catch (Exception ignored) {}

        // 2. Titreşim başlat
        try {
            if (vibrator != null) {
                long[] pattern = {0, 800, 200, 800, 200, 1000};
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    vibrator.vibrate(VibrationEffect.createWaveform(pattern, 0));
                } else {
                    vibrator.vibrate(pattern, 0);
                }
            }
        } catch (Exception ignored) {}

        // 3. Zil Sesi / Siren Çal
        try {
            Uri alarmUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
            if (alarmUri == null) alarmUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
            if (alarmRingtone == null) {
                alarmRingtone = RingtoneManager.getRingtone(getApplicationContext(), alarmUri);
            }
            if (!alarmRingtone.isPlaying()) {
                alarmRingtone.play();
            }
        } catch (Exception ignored) {}

        // 4. Yüksek Öncelikli Bildirim Fırlat
        Intent openAppIntent = new Intent(this, MainActivity.class);
        openAppIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pendingIntent = PendingIntent.getActivity(
                this, 1, openAppIntent,
                Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0
        );

        Notification alarmNotification = new NotificationCompat.Builder(this, ALARM_CHANNEL_ID)
                .setContentTitle("🚨 YENİ ÇAĞRI GELDİ!")
                .setContentText(address)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setCategory(NotificationCompat.CATEGORY_CALL)
                .setContentIntent(pendingIntent)
                .setAutoCancel(true)
                .setFullScreenIntent(pendingIntent, true)
                .build();

        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) {
            manager.notify(ALARM_NOTIFICATION_ID, alarmNotification);
        }
    }

    public void stopCallAlarm() {
        if (vibrator != null) vibrator.cancel();
        if (alarmRingtone != null && alarmRingtone.isPlaying()) alarmRingtone.stop();
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) manager.cancel(ALARM_NOTIFICATION_ID);
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        stopCallAlarm();
        if (locationManager != null) locationManager.removeUpdates(this);
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
