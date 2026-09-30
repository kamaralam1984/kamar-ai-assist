package in.piyu.assistant;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "PiyuBackground")
public class PiyuBackgroundPlugin extends Plugin {
    @PluginMethod public void start(PluginCall call) {
        Context c = getContext();
        c.getSharedPreferences(PiyuService.PREFS, Context.MODE_PRIVATE).edit()
            .putBoolean("on", true).putString("title", call.getString("title", "Piyu")).putString("text", call.getString("text", "Piyu चालू है — आपके alarm सुरक्षित हैं")).apply();
        try { PiyuService.start(c); call.resolve(state()); } catch (Exception e) { call.reject(String.valueOf(e.getMessage())); }
    }
    @PluginMethod public void stop(PluginCall call) {
        Context c = getContext();
        PiyuService.setWanted(c, false);
        c.stopService(new Intent(c, PiyuService.class));
        call.resolve(state());
    }
    @PluginMethod public void status(PluginCall call) { call.resolve(state()); }
    /** ask Android not to put Piyu to sleep (Doze / battery saver) */
    @PluginMethod public void requestBatteryExemption(PluginCall call) {
        Context c = getContext();
        try {
            if (Build.VERSION.SDK_INT >= 23 && !exempt(c)) {
                Intent i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + c.getPackageName()));
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK); c.startActivity(i);
            }
        } catch (Exception e) {
            try { Intent i = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS); i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK); c.startActivity(i); } catch (Exception e2) { }
        }
        call.resolve(state());
    }
    private static boolean exempt(Context c) {
        if (Build.VERSION.SDK_INT < 23) return true;
        PowerManager pm = (PowerManager) c.getSystemService(Context.POWER_SERVICE);
        return pm.isIgnoringBatteryOptimizations(c.getPackageName());
    }
    private JSObject state() {
        Context c = getContext();
        JSObject o = new JSObject();
        o.put("wanted", PiyuService.wanted(c));
        o.put("batteryExempt", exempt(c));
        return o;
    }
}
