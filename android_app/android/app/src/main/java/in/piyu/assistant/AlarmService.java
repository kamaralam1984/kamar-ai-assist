package in.piyu.assistant;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.os.VibrationEffect;
import android.os.Vibrator;

import org.json.JSONObject;

/** Rings the alarm: looping alarm sound on the ALARM volume (rises slowly), vibration, and a full-screen notification that lights the screen. */
public class AlarmService extends Service {
    static final String CH = "piyu_ring", ACT_DONE = "in.piyu.assistant.DONE", ACT_SNOOZE = "in.piyu.assistant.SNOOZE", ACT_STOP = "in.piyu.assistant.STOP", STOPPED = "in.piyu.assistant.ALARM_STOPPED";
    static final int NID = 7002, RING_MS = 90_000, SNOOZE_MIN = 5;
    private MediaPlayer mp; private Vibrator vib; private PowerManager.WakeLock wl;
    private final Handler h = new Handler(Looper.getMainLooper());
    private JSONObject cur; private float vol = 0.15f; private boolean ringing = false;
    private final Runnable rise = new Runnable() { @Override public void run() { if (mp != null && ringing) { vol = Math.min(1f, vol + 0.12f); try { mp.setVolume(vol, vol); } catch (Exception e) { } if (vol < 1f) h.postDelayed(this, 1200); } } };
    private final Runnable giveUp = new Runnable() { @Override public void run() { missed(); } };

    @Override public int onStartCommand(Intent in, int flags, int startId) {
        String act = in == null ? null : in.getAction();
        if (ACT_DONE.equals(act) || ACT_SNOOZE.equals(act) || ACT_STOP.equals(act)) {
            if (cur == null && in.getStringExtra("alarm") != null) { try { cur = new JSONObject(in.getStringExtra("alarm")); } catch (Exception e) { } }
            finish(ACT_DONE.equals(act) ? "done" : ACT_SNOOZE.equals(act) ? "snooze" : "stop");
            return START_NOT_STICKY;
        }
        String a = in == null ? null : in.getStringExtra("alarm");
        if (a == null) { stopSelf(); return START_NOT_STICKY; }
        if (ringing) { stopSound(); }                                       // a second alarm while one rings: the newest wins
        try { cur = new JSONObject(a); } catch (Exception e) { stopSelf(); return START_NOT_STICKY; }
        Notification n = notif(cur);
        if (Build.VERSION.SDK_INT >= 34) startForeground(NID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        else startForeground(NID, n);
        ringing = true;
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        if (wl == null) { wl = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "piyu:ring"); wl.setReferenceCounted(false); }
        wl.acquire(RING_MS + 10_000);
        startSound(); startVibration();
        try { startActivity(activityIntent(cur)); } catch (Exception e) { }   // allowed when the app is in front / permission granted; otherwise the full-screen notification does it
        h.removeCallbacks(giveUp); h.postDelayed(giveUp, RING_MS);
        return START_NOT_STICKY;
    }

    private Intent activityIntent(JSONObject a) {
        return new Intent(this, AlarmActivity.class).putExtra("alarm", a.toString()).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_NO_USER_ACTION);
    }
    private PendingIntent svc(String action, int code) {
        Intent i = new Intent(this, AlarmService.class).setAction(action).putExtra("alarm", cur == null ? "" : cur.toString());
        return PendingIntent.getService(this, code, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }
    private Notification notif(JSONObject a) {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(CH) == null) {
            NotificationChannel ch = new NotificationChannel(CH, "Piyu alarm ring", NotificationManager.IMPORTANCE_HIGH);
            ch.setDescription("The ringing alarm screen"); ch.setSound(null, null); ch.enableVibration(false); ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC); ch.setBypassDnd(true);
            nm.createNotificationChannel(ch);
        }
        PendingIntent full = PendingIntent.getActivity(this, 1, activityIntent(a), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CH) : new Notification.Builder(this);
        int icon = getResources().getIdentifier("ic_stat_piyu", "drawable", getPackageName());
        b.setSmallIcon(icon != 0 ? icon : android.R.drawable.ic_lock_idle_alarm)
         .setContentTitle(a.optString("title", "Piyu")).setContentText(a.optString("body", ""))
         .setStyle(new Notification.BigTextStyle().bigText(a.optString("body", "")))
         .setCategory(Notification.CATEGORY_ALARM).setPriority(Notification.PRIORITY_MAX).setOngoing(true).setAutoCancel(false)
         .setVisibility(Notification.VISIBILITY_PUBLIC).setFullScreenIntent(full, true).setContentIntent(full)
         .addAction(new Notification.Action.Builder(null, a.optString("doneLbl", "✔ Done"), svc(ACT_DONE, 11)).build())
         .addAction(new Notification.Action.Builder(null, a.optString("snoozeLbl", "Snooze 5 min"), svc(ACT_SNOOZE, 12)).build());
        return b.build();
    }

    private void startSound() {
        try {
            AudioManager am = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
            int max = am.getStreamMaxVolume(AudioManager.STREAM_ALARM), want = Math.max(am.getStreamVolume(AudioManager.STREAM_ALARM), Math.round(max * 0.7f));
            try { am.setStreamVolume(AudioManager.STREAM_ALARM, want, 0); } catch (Exception e) { }      // an alarm must be heard even if the alarm volume was turned down
            Uri u = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
            if (u == null) u = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
            if (u == null) u = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
            mp = new MediaPlayer();
            mp.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
            mp.setDataSource(this, u); mp.setLooping(true); vol = 0.15f; mp.setVolume(vol, vol); mp.prepare(); mp.start();
            h.removeCallbacks(rise); h.postDelayed(rise, 1200);
        } catch (Exception e) { mp = null; }
    }
    private void startVibration() {
        try {
            vib = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
            long[] pat = { 0, 700, 500, 700, 500, 1200, 900 };
            if (Build.VERSION.SDK_INT >= 26) vib.vibrate(VibrationEffect.createWaveform(pat, 0), new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
            else vib.vibrate(pat, 0);
        } catch (Exception e) { }
    }
    private void stopSound() {
        ringing = false; h.removeCallbacks(rise); h.removeCallbacks(giveUp);
        try { if (mp != null) { mp.stop(); mp.release(); } } catch (Exception e) { }
        mp = null;
        try { if (vib != null) vib.cancel(); } catch (Exception e) { }
    }

    /** nobody answered for 90 s: stop the noise, leave a normal notification so the task is not forgotten */
    private void missed() {
        JSONObject a = cur; stopSound();
        try {
            if (a != null) {
                PiyuAlarm.pushAction(this, a.optString("taskId"), "missed", a.optString("kind"));
                NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
                Intent open = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_NEW_TASK);
                PendingIntent pi = PendingIntent.getActivity(this, 2, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
                if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel("piyu_missed") == null) nm.createNotificationChannel(new NotificationChannel("piyu_missed", "Piyu missed alarm", NotificationManager.IMPORTANCE_HIGH));
                Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, "piyu_missed") : new Notification.Builder(this);
                int icon = getResources().getIdentifier("ic_stat_piyu", "drawable", getPackageName());
                b.setSmallIcon(icon != 0 ? icon : android.R.drawable.ic_lock_idle_alarm).setContentTitle(a.optString("title", "Piyu")).setContentText(a.optString("body", "")).setContentIntent(pi).setAutoCancel(true);
                nm.notify(7100 + (int) (a.optLong("id") % 1000), b.build());
            }
        } catch (Exception e) { }
        sendBroadcast(new Intent(STOPPED).setPackage(getPackageName()));
        stopForeground(true); stopSelf();
    }

    private void finish(String what) {
        JSONObject a = cur; stopSound();
        if (a != null) {
            if ("done".equals(what)) PiyuAlarm.pushAction(this, a.optString("taskId"), "done", a.optString("kind"));
            else if ("snooze".equals(what)) {
                PiyuAlarm.pushAction(this, a.optString("taskId"), "snooze", a.optString("kind"));
                try { a.put("at", System.currentTimeMillis() + SNOOZE_MIN * 60_000L).put("id", a.optLong("id") + 1L); PiyuAlarm.add(this, a); } catch (Exception e) { }
            }
        }
        sendBroadcast(new Intent(STOPPED).setPackage(getPackageName()));
        stopForeground(true); stopSelf();
    }

    @Override public void onDestroy() { stopSound(); try { if (wl != null && wl.isHeld()) wl.release(); } catch (Exception e) { } super.onDestroy(); }
    @Override public IBinder onBind(Intent i) { return null; }
}
