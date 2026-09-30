package in.piyu.assistant;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

/** Piyu's own alarm clock: real exact alarms (AlarmManager.setAlarmClock — works in Doze / when the app is closed) that ring like a clock alarm. */
final class PiyuAlarm {
    static final String PREFS = "piyu_alarms";
    private PiyuAlarm() { }

    private static SharedPreferences sp(Context c) { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    static synchronized JSONArray load(Context c) {
        try { return new JSONArray(sp(c).getString("list", "[]")); } catch (Exception e) { return new JSONArray(); }
    }
    private static void save(Context c, JSONArray a) { sp(c).edit().putString("list", a.toString()).apply(); }

    private static PendingIntent pi(Context c, long id, JSONObject a) {
        Intent i = new Intent(c, AlarmReceiver.class).setAction("in.piyu.assistant.ALARM").setPackage(c.getPackageName());
        if (a != null) i.putExtra("alarm", a.toString());
        return PendingIntent.getBroadcast(c, (int) id, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    static void schedule(Context c, JSONObject a) {
        try {
            long at = a.getLong("at"), id = a.getLong("id");
            AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
            Intent open = new Intent(c, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_NEW_TASK);
            PendingIntent show = PendingIntent.getActivity(c, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
            am.setAlarmClock(new AlarmManager.AlarmClockInfo(at, show), pi(c, id, a));
        } catch (Exception e) { }
    }

    static void cancel(Context c, long id) {
        try { ((AlarmManager) c.getSystemService(Context.ALARM_SERVICE)).cancel(pi(c, id, null)); } catch (Exception e) { }
    }

    /** make the phone's alarms exactly equal to `list` (stale ones are cancelled, all others (re)scheduled) */
    static synchronized int syncAll(Context c, JSONArray list) {
        JSONArray old = load(c);
        for (int i = 0; i < old.length(); i++) { JSONObject o = old.optJSONObject(i); if (o != null) cancel(c, o.optLong("id")); }
        JSONArray keep = new JSONArray(); long now = System.currentTimeMillis();
        for (int i = 0; i < list.length(); i++) {
            JSONObject a = list.optJSONObject(i);
            if (a == null || a.optLong("at") <= now) continue;
            keep.put(a); schedule(c, a);
        }
        save(c, keep);
        return keep.length();
    }

    static synchronized void remove(Context c, long id) {
        JSONArray old = load(c), keep = new JSONArray();
        for (int i = 0; i < old.length(); i++) { JSONObject o = old.optJSONObject(i); if (o != null && o.optLong("id") != id) keep.put(o); }
        save(c, keep);
    }

    static synchronized void add(Context c, JSONObject a) {
        remove(c, a.optLong("id")); JSONArray l = load(c); l.put(a); save(c, l); schedule(c, a);
    }

    /** after a restart the OS forgets every alarm: put the saved ones back */
    static void rescheduleAll(Context c) {
        JSONArray l = load(c), keep = new JSONArray(); long now = System.currentTimeMillis();
        for (int i = 0; i < l.length(); i++) { JSONObject a = l.optJSONObject(i); if (a != null && a.optLong("at") > now) { keep.put(a); schedule(c, a); } }
        save(c, keep);
    }

    /* what the user pressed on the ringing alarm (Done / Snooze): kept until the app is open and can apply it to its task list */
    static synchronized void pushAction(Context c, String taskId, String action, String kind) {
        try {
            JSONArray l = new JSONArray(sp(c).getString("actions", "[]"));
            l.put(new JSONObject().put("taskId", taskId).put("action", action).put("kind", kind));
            sp(c).edit().putString("actions", l.toString()).apply();
        } catch (Exception e) { }
    }
    static synchronized JSONArray takeActions(Context c) {
        JSONArray l; try { l = new JSONArray(sp(c).getString("actions", "[]")); } catch (Exception e) { l = new JSONArray(); }
        sp(c).edit().putString("actions", "[]").apply();
        return l;
    }
}
