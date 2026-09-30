package in.piyu.assistant;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

/** Keeps Piyu alive in the background while the user is logged in (foreground service = the process is not killed when the app is closed / another app is used). */
public class PiyuService extends Service {
    static final String CH = "piyu_service", PREFS = "piyu_bg";
    static final int ID = 7001;
    private PowerManager.WakeLock wl;

    static boolean wanted(Context c) { return c.getSharedPreferences(PREFS, MODE_PRIVATE).getBoolean("on", false); }
    static void setWanted(Context c, boolean on) { c.getSharedPreferences(PREFS, MODE_PRIVATE).edit().putBoolean("on", on).apply(); }

    static void start(Context c) {
        Intent i = new Intent(c, PiyuService.class);
        if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i); else c.startService(i);
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        SharedPreferences p = getSharedPreferences(PREFS, MODE_PRIVATE);
        if (!p.getBoolean("on", false)) { stopSelf(); return START_NOT_STICKY; }
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(CH) == null) {
            NotificationChannel ch = new NotificationChannel(CH, "Piyu background", NotificationManager.IMPORTANCE_LOW);
            ch.setDescription("Shows that Piyu is running so your alarms are never missed");
            ch.setShowBadge(false);
            nm.createNotificationChannel(ch);
        }
        Intent open = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_NEW_TASK);
        PendingIntent pi = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CH) : new Notification.Builder(this);
        int icon = getResources().getIdentifier("ic_stat_piyu", "drawable", getPackageName());
        b.setContentTitle(p.getString("title", "Piyu"))
         .setContentText(p.getString("text", "Piyu चालू है — आपके alarm सुरक्षित हैं"))
         .setSmallIcon(icon != 0 ? icon : android.R.drawable.ic_lock_idle_alarm)
         .setOngoing(true).setContentIntent(pi).setOnlyAlertOnce(true);
        Notification n = b.build();
        if (Build.VERSION.SDK_INT >= 34) startForeground(ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        else startForeground(ID, n);
        if (wl == null) {   // a partial wake lock keeps the CPU running for timers/sync while the screen is off
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            wl = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "piyu:bg");
            wl.setReferenceCounted(false); wl.acquire();
        }
        return START_STICKY;
    }

    @Override public void onTaskRemoved(Intent rootIntent) {   // user swiped Piyu away from recents: come back at once
        if (wanted(this)) start(this);
        super.onTaskRemoved(rootIntent);
    }

    @Override public void onDestroy() {
        if (wl != null && wl.isHeld()) wl.release();
        super.onDestroy();
    }

    @Override public IBinder onBind(Intent intent) { return null; }
}
