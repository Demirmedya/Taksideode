package com.taksideode.pos;

import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.media.ToneGenerator;
import android.net.Uri;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.webkit.JavascriptInterface;

public class WebAppInterface {

    private final Context context;
    private Ringtone directRingtone;
    private Vibrator directVibrator;
    private ToneGenerator toneGenerator;

    public WebAppInterface(Context context) {
        this.context = context;
        try {
            directVibrator = (Vibrator) context.getSystemService(Context.VIBRATOR_SERVICE);
        } catch (Exception ignored) {}
    }

    @JavascriptInterface
    public void startBackgroundService(String shiftId) {
        // Foreground service is not required for taxi terminal operation
    }

    @JavascriptInterface
    public void playCallAlarm() {
        playCallAlarm("Yeni Müşteri Çağrısı");
    }

    @JavascriptInterface
    public void playCallAlarm(String address) {
        // 1. Doğrudan Ringtone çal (Alarm seviyesinde)
        try {
            Uri alarmUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
            if (alarmUri == null) alarmUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
            if (alarmUri == null) alarmUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);

            if (directRingtone == null) {
                directRingtone = RingtoneManager.getRingtone(context.getApplicationContext(), alarmUri);
                if (directRingtone != null) {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                        AudioAttributes aa = new AudioAttributes.Builder()
                                .setUsage(AudioAttributes.USAGE_ALARM)
                                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                                .build();
                        directRingtone.setAudioAttributes(aa);
                    } else {
                        directRingtone.setStreamType(AudioManager.STREAM_ALARM);
                    }
                }
            }

            if (directRingtone != null && !directRingtone.isPlaying()) {
                directRingtone.play();
            }
        } catch (Exception e) {
            e.printStackTrace();
        }

        // 2. Yedek ToneGenerator (Kesin ses garantisi)
        try {
            if (toneGenerator == null) {
                toneGenerator = new ToneGenerator(AudioManager.STREAM_ALARM, 100);
            }
            toneGenerator.startTone(ToneGenerator.TONE_CDMA_HIGH_L, 1200);
        } catch (Exception ignored) {}

        // 3. Doğrudan Titreşim
        try {
            if (directVibrator != null) {
                long[] pattern = {0, 800, 200, 800, 200, 800};
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    directVibrator.vibrate(VibrationEffect.createWaveform(pattern, 0));
                } else {
                    directVibrator.vibrate(pattern, 0);
                }
            }
        } catch (Exception ignored) {}

        // 4. Arka plan servisine de bildir
        try {
            Intent intent = new Intent(context, PosForegroundService.class);
            intent.setAction("PLAY_ALARM");
            intent.putExtra("address", address);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent);
            } else {
                context.startService(intent);
            }
        } catch (Exception ignored) {}
    }

    @JavascriptInterface
    public void stopCallAlarm() {
        try {
            if (directRingtone != null && directRingtone.isPlaying()) {
                directRingtone.stop();
            }
            if (toneGenerator != null) {
                toneGenerator.stopTone();
            }
            if (directVibrator != null) {
                directVibrator.cancel();
            }
        } catch (Exception ignored) {}

        try {
            Intent intent = new Intent(context, PosForegroundService.class);
            intent.setAction("STOP_ALARM");
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent);
            } else {
                context.startService(intent);
            }
        } catch (Exception ignored) {}
    }

    @JavascriptInterface
    public void playNotificationSound() {
        try {
            Uri notifUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
            Ringtone r = RingtoneManager.getRingtone(context.getApplicationContext(), notifUri);
            if (r != null) r.play();
            if (directVibrator != null) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    directVibrator.vibrate(VibrationEffect.createOneShot(300, VibrationEffect.DEFAULT_AMPLITUDE));
                } else {
                    directVibrator.vibrate(300);
                }
            }
        } catch (Exception ignored) {}
    }

    @JavascriptInterface
    public void openNavigation(String destination) {
        if (destination == null || destination.trim().isEmpty()) return;
        try {
            android.net.Uri gmmIntentUri = android.net.Uri.parse("google.navigation:q=" + android.net.Uri.encode(destination) + "&mode=d");
            Intent mapIntent = new Intent(Intent.ACTION_VIEW, gmmIntentUri);
            mapIntent.setPackage("com.google.android.apps.maps");
            mapIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            if (mapIntent.resolveActivity(context.getPackageManager()) != null) {
                context.startActivity(mapIntent);
                return;
            }

            android.net.Uri geoUri = android.net.Uri.parse("geo:0,0?q=" + android.net.Uri.encode(destination));
            Intent geoIntent = new Intent(Intent.ACTION_VIEW, geoUri);
            geoIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            if (geoIntent.resolveActivity(context.getPackageManager()) != null) {
                context.startActivity(geoIntent);
                return;
            }

            Intent browserIntent = new Intent(Intent.ACTION_VIEW, android.net.Uri.parse("https://www.google.com/maps/dir/?api=1&destination=" + android.net.Uri.encode(destination)));
            browserIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(browserIntent);
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    @JavascriptInterface
    public void makePhoneCall(String phoneNumber) {
        if (phoneNumber == null || phoneNumber.trim().isEmpty()) return;
        try {
            Intent callIntent = new Intent(Intent.ACTION_DIAL, android.net.Uri.parse("tel:" + phoneNumber.trim()));
            callIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(callIntent);
        } catch (Exception e) {
            e.printStackTrace();
        }
    }
}
