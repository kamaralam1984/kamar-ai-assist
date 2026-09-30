package in.piyu.assistant;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import org.json.JSONObject;

/** The clock has reached an alarm: start the ringing service (allowed from the background because it comes from AlarmManager.setAlarmClock). */
public class AlarmReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context c, Intent i) {
        String a = i.getStringExtra("alarm");
        if (a == null) return;
        try { PiyuAlarm.remove(c, new JSONObject(a).optLong("id")); } catch (Exception e) { }
        Intent s = new Intent(c, AlarmService.class).putExtra("alarm", a);
        try { if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(s); else c.startService(s); } catch (Exception e) { }
    }
}
