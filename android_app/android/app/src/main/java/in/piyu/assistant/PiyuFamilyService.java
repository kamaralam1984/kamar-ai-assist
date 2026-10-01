package in.piyu.assistant;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.BatteryManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Scanner;

/**
 * Piyu Family — one foreground service with two jobs, both free and without Google services:
 *  1. CHILD phone (only while the parent has switched location sharing ON): reads the phone's GPS / network location every few minutes and posts it to the
 *     Piyu server. The ongoing notification says "Location sharing ON" for as long as it runs — it can never run hidden.
 *  2. PARENT phone: asks the server about new alerts (arrived / left / late / SOS ...) once a minute and shows them as notifications, also when the app is closed.
 *     The child phone also fetches the parent's short messages.
 */
public class PiyuFamilyService extends Service {
    static final String PREFS = "piyu_family", CH = "piyu_family", CH_ALERT = "piyu_family_alert", CH_SOS = "piyu_family_sos";
    static final int ID = 7002;
    private final Handler h = new Handler(Looper.getMainLooper());
    private LocationManager lm;
    private Location best;
    private long lastPost = 0, lastPoll = 0;
    private boolean running = false;
    private final LocationListener listener = new LocationListener() {
        @Override public void onLocationChanged(Location l) { if (better(l, best)) best = l; }
        @Override public void onStatusChanged(String p, int s, Bundle b) { }
        @Override public void onProviderEnabled(String p) { }
        @Override public void onProviderDisabled(String p) { }
    };

    static SharedPreferences prefs(Context c) { return c.getSharedPreferences(PREFS, MODE_PRIVATE); }
    static boolean wanted(Context c) { SharedPreferences p = prefs(c); return p.getBoolean("loc", false) || p.getBoolean("alerts", false); }
    static void start(Context c) {
        Intent i = new Intent(c, PiyuFamilyService.class);
        if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i); else c.startService(i);
    }
    static boolean hasLocPerm(Context c) {
        return c.checkSelfPermission(android.Manifest.permission.ACCESS_FINE_LOCATION) == android.content.pm.PackageManager.PERMISSION_GRANTED
            || c.checkSelfPermission(android.Manifest.permission.ACCESS_COARSE_LOCATION) == android.content.pm.PackageManager.PERMISSION_GRANTED;
    }

    private static boolean better(Location n, Location o) {
        if (n == null) return false;
        if (o == null) return true;
        long dt = n.getTime() - o.getTime();
        if (dt > 120000) return true;
        if (dt < -120000) return false;
        int dAcc = (int) (n.getAccuracy() - o.getAccuracy());
        return dAcc < 0 || (dt > 0 && dAcc <= 20);
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        SharedPreferences p = prefs(this);
        boolean loc = p.getBoolean("loc", false) && hasLocPerm(this), alerts = p.getBoolean("alerts", false);
        if (!loc && !alerts) { stopSelf(); return START_NOT_STICKY; }
        channels();
        Intent open = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_NEW_TASK);
        PendingIntent pi = PendingIntent.getActivity(this, 1, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CH) : new Notification.Builder(this);
        int icon = getResources().getIdentifier("ic_stat_piyu", "drawable", getPackageName());
        b.setContentTitle(loc ? p.getString("locTitle", "📍 Location sharing ON") : p.getString("famTitle", "👪 Piyu Family"))
         .setContentText(loc ? p.getString("locText", "Your parent can see where you are") : p.getString("famText", "Alerts about your child are on"))
         .setSmallIcon(icon != 0 ? icon : android.R.drawable.ic_menu_mylocation).setOngoing(true).setContentIntent(pi).setOnlyAlertOnce(true);
        try {
            if (Build.VERSION.SDK_INT >= 34) startForeground(ID, b.build(), loc ? ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION : ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
            else if (Build.VERSION.SDK_INT >= 29) startForeground(ID, b.build(), loc ? ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION : ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
            else startForeground(ID, b.build());
        } catch (Exception e) {
            p.edit().putString("err", "fgs:" + e.getMessage()).apply();
            boolean ok = false;   // e.g. location FGS not allowed from boot on Android 14: stay alive as data-sync (alerts only), no location reading
            if (loc && alerts && Build.VERSION.SDK_INT >= 29) { try { startForeground(ID, b.build(), ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC); ok = true; loc = false; } catch (Exception e2) { } }
            if (!ok) { stopSelf(); return START_NOT_STICKY; }
        }
        if (!running) { running = true; h.post(loop); }
        if (loc) listen(); else unlisten();
        return START_STICKY;
    }

    private void channels() {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm.getNotificationChannel(CH) == null) { NotificationChannel c = new NotificationChannel(CH, "Piyu Family", NotificationManager.IMPORTANCE_LOW); c.setShowBadge(false); nm.createNotificationChannel(c); }
        if (nm.getNotificationChannel(CH_ALERT) == null) {
            NotificationChannel c = new NotificationChannel(CH_ALERT, "Child alerts", NotificationManager.IMPORTANCE_HIGH);
            c.enableVibration(true); c.setVibrationPattern(new long[]{0, 300, 150, 300}); nm.createNotificationChannel(c);
        }
        if (nm.getNotificationChannel(CH_SOS) == null) {
            NotificationChannel c = new NotificationChannel(CH_SOS, "SOS", NotificationManager.IMPORTANCE_HIGH);
            Uri snd = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
            c.setSound(snd, new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
            c.enableVibration(true); c.setVibrationPattern(new long[]{0, 600, 200, 600, 200, 600}); c.setBypassDnd(true); nm.createNotificationChannel(c);
        }
    }

    private void listen() {
        if (lm != null) return;
        try {
            lm = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
            long every = Math.max(1, prefs(this).getInt("every", 2)) * 60000L;
            for (String pv : new String[]{LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER}) {
                try { if (lm.isProviderEnabled(pv)) { lm.requestLocationUpdates(pv, every, 0f, listener, Looper.getMainLooper()); Location l = lm.getLastKnownLocation(pv); if (better(l, best)) best = l; } } catch (SecurityException | IllegalArgumentException e) { }
            }
        } catch (Exception e) { prefs(this).edit().putString("err", "loc:" + e.getMessage()).apply(); }
    }
    private void unlisten() { if (lm != null) { try { lm.removeUpdates(listener); } catch (Exception e) { } lm = null; } }

    private final Runnable loop = new Runnable() {
        @Override public void run() {
            SharedPreferences p = prefs(PiyuFamilyService.this);
            boolean loc = p.getBoolean("loc", false) && hasLocPerm(PiyuFamilyService.this), alerts = p.getBoolean("alerts", false);
            if (!loc && !alerts) { unlisten(); running = false; stopForeground(true); stopSelf(); return; }
            if (!loc) unlisten();
            final long now = System.currentTimeMillis(), every = Math.max(1, p.getInt("every", 2)) * 60000L;
            if (loc) {
                if (lm == null) listen();
                if (best != null && now - lastPost >= every - 5000 && now - best.getTime() < every * 3 + 60000) {
                    final Location l = best; lastPost = now;
                    new Thread(() -> postLoc(l)).start();
                }
            }
            if (now - lastPoll >= 55000) {
                lastPoll = now;
                new Thread(() -> { try { if (alerts) pollAlerts(); if (loc) pollMsgs(); } catch (Exception e) { prefs(PiyuFamilyService.this).edit().putString("err", "poll:" + e.getMessage()).apply(); } }).start();
            }
            h.postDelayed(this, 20000);
        }
    };

    private HttpURLConnection open(String path, String method) throws Exception {
        SharedPreferences p = prefs(this);
        String base = p.getString("server", "");
        if (base.isEmpty()) throw new Exception("no server");
        HttpURLConnection c = (HttpURLConnection) new URL(base.replaceAll("/+$", "") + path).openConnection();
        c.setRequestMethod(method); c.setConnectTimeout(15000); c.setReadTimeout(20000);
        c.setRequestProperty("X-Piyu-Token", p.getString("token", "")); c.setRequestProperty("X-Piyu-Device", p.getString("device", ""));
        c.setRequestProperty("Content-Type", "application/json");
        return c;
    }
    private static String slurp(HttpURLConnection c) throws Exception {
        InputStream in = c.getResponseCode() < 400 ? c.getInputStream() : c.getErrorStream();
        if (in == null) return "";
        Scanner s = new Scanner(in, "UTF-8").useDelimiter("\\A");
        String r = s.hasNext() ? s.next() : ""; in.close(); return r;
    }

    private void postLoc(Location l) {
        try {
            int batt = -1;
            try { Intent bi = registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED)); if (bi != null) batt = (int) (100f * bi.getIntExtra(BatteryManager.EXTRA_LEVEL, 0) / Math.max(1, bi.getIntExtra(BatteryManager.EXTRA_SCALE, 100))); } catch (Exception e) { }
            JSONObject o = new JSONObject();
            o.put("lat", l.getLatitude()); o.put("lng", l.getLongitude()); o.put("acc", l.getAccuracy()); o.put("at", l.getTime());
            if (batt >= 0) o.put("batt", batt);
            HttpURLConnection c = open("/api/kids/loc", "POST");
            c.setDoOutput(true);
            OutputStream os = c.getOutputStream(); os.write(o.toString().getBytes("UTF-8")); os.close();
            int code = c.getResponseCode(); slurp(c);
            prefs(this).edit().putLong("lastPost", System.currentTimeMillis()).putInt("lastCode", code).apply();
            if (code == 403) {                                         // the parent switched sharing off (or the feature is off): stop for good
                String why = ""; prefs(this).edit().putBoolean("loc", false).apply();
            }
        } catch (Exception e) { prefs(this).edit().putString("err", "post:" + e.getMessage()).apply(); }
    }

    private void pollAlerts() throws Exception {
        SharedPreferences p = prefs(this);
        HttpURLConnection c = open("/api/family/alerts?since=" + p.getLong("since", 0), "GET");
        String body = slurp(c);
        if (c.getResponseCode() != 200) return;
        JSONArray a = new JSONObject(body).getJSONArray("alerts");
        long max = p.getLong("since", 0);
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        for (int i = 0; i < a.length(); i++) {
            JSONObject x = a.getJSONObject(i);
            long id = x.getLong("id"); if (id > max) max = id;
            boolean sos = "sos".equals(x.optString("kind"));
            Intent open = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_NEW_TASK);
            PendingIntent pi = PendingIntent.getActivity(this, (int) (id % 100000) + 10, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
            Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, sos ? CH_SOS : CH_ALERT) : new Notification.Builder(this);
            int icon = getResources().getIdentifier("ic_stat_piyu", "drawable", getPackageName());
            b.setContentTitle(x.optString("title")).setContentText(x.optString("body")).setSmallIcon(icon != 0 ? icon : android.R.drawable.ic_dialog_alert)
             .setAutoCancel(true).setContentIntent(pi).setWhen(x.optLong("at", System.currentTimeMillis())).setStyle(new Notification.BigTextStyle().bigText(x.optString("body")));
            if (sos) { b.setPriority(Notification.PRIORITY_MAX); b.setCategory(Notification.CATEGORY_ALARM); try { b.setFullScreenIntent(pi, true); } catch (Exception e) { } }
            nm.notify(20000 + (int) (id % 100000), b.build());
        }
        if (max > p.getLong("since", 0)) p.edit().putLong("since", max).apply();
    }

    private void pollMsgs() throws Exception {
        SharedPreferences p = prefs(this);
        HttpURLConnection c = open("/api/kids/msgs?since=" + p.getLong("msgSince", 0), "GET");
        String body = slurp(c);
        if (c.getResponseCode() != 200) return;
        JSONArray a = new JSONObject(body).getJSONArray("msgs");
        long max = p.getLong("msgSince", 0);
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        for (int i = 0; i < a.length(); i++) {
            JSONObject x = a.getJSONObject(i);
            long id = x.getLong("id"); if (id > max) max = id;
            Intent open = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_NEW_TASK);
            PendingIntent pi = PendingIntent.getActivity(this, (int) (id % 100000) + 500, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
            Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CH_ALERT) : new Notification.Builder(this);
            int icon = getResources().getIdentifier("ic_stat_piyu", "drawable", getPackageName());
            b.setContentTitle(p.getString("msgTitle", "💌 Message from your parent")).setContentText(x.optString("text")).setSmallIcon(icon != 0 ? icon : android.R.drawable.ic_dialog_email).setAutoCancel(true).setContentIntent(pi);
            nm.notify(30000 + (int) (id % 100000), b.build());
        }
        if (max > p.getLong("msgSince", 0)) p.edit().putLong("msgSince", max).apply();
    }

    @Override public void onTaskRemoved(Intent rootIntent) { if (wanted(this)) start(this); super.onTaskRemoved(rootIntent); }
    @Override public void onDestroy() { unlisten(); h.removeCallbacksAndMessages(null); running = false; super.onDestroy(); }
    @Override public IBinder onBind(Intent intent) { return null; }
}
