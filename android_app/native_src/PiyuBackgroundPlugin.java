package in.piyu.assistant;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.media.AudioManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.PowerManager;
import android.provider.Settings;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.util.ArrayList;

/** Piyu's own native bridge: background service, permissions (mic / camera / battery / volume), the phone's speech recognition. */
@CapacitorPlugin(
    name = "PiyuBackground",
    permissions = {
        @Permission(alias = "mic", strings = { Manifest.permission.RECORD_AUDIO }),
        @Permission(alias = "camera", strings = { Manifest.permission.CAMERA })
    }
)
public class PiyuBackgroundPlugin extends Plugin {
    private SpeechRecognizer sr;
    private boolean listening = false;

    /* ---------------- background service ---------------- */
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

    /** version of THIS installed shell (the web part comes live from the server, so only the shell has a version) */
    @PluginMethod public void appInfo(PluginCall call) {
        JSObject o = new JSObject();
        try {
            android.content.pm.PackageInfo p = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
            o.put("versionCode", Build.VERSION.SDK_INT >= 28 ? p.getLongVersionCode() : p.versionCode); o.put("versionName", p.versionName);
        } catch (Exception e) { o.put("versionCode", 0); }
        call.resolve(o);
    }

    /** a stable id of this phone (ANDROID_ID: survives re-installs of the same app): a user token is bound to it */
    @PluginMethod public void deviceId(PluginCall call) {
        JSObject o = new JSObject();
        try { o.put("id", Settings.Secure.getString(getContext().getContentResolver(), Settings.Secure.ANDROID_ID)); } catch (Exception e) { o.put("id", ""); }
        call.resolve(o);
    }

    /* ---------------- alarm clock (rings like a real alarm: sound on the alarm volume, lights the screen, full-screen animated page) ---------------- */
    @PluginMethod public void alarmSync(PluginCall call) {
        try { JSObject o = new JSObject(); o.put("count", PiyuAlarm.syncAll(getContext(), call.getArray("alarms", new JSArray()))); call.resolve(o); }
        catch (Exception e) { call.reject(String.valueOf(e.getMessage())); }
    }
    /** what the user pressed on a ringing alarm while the app was closed */
    @PluginMethod public void alarmActions(PluginCall call) {
        try { JSObject o = new JSObject(); o.put("actions", PiyuAlarm.takeActions(getContext())); call.resolve(o); } catch (Exception e) { call.reject(String.valueOf(e.getMessage())); }
    }
    @PluginMethod public void alarmTest(PluginCall call) {
        try {
            org.json.JSONObject a = new org.json.JSONObject().put("id", 99001L).put("at", System.currentTimeMillis() + call.getInt("seconds", 5) * 1000L)
                .put("title", call.getString("title", "⏰ Piyu test alarm")).put("body", call.getString("body", "Alarm theek se baj raha hai"))
                .put("taskId", "").put("kind", "test").put("doneLbl", call.getString("doneLbl", "✔ Done")).put("snoozeLbl", call.getString("snoozeLbl", "Snooze 5 min")).put("stopLbl", call.getString("stopLbl", "Stop"));
            PiyuAlarm.add(getContext(), a); call.resolve();
        } catch (Exception e) { call.reject(String.valueOf(e.getMessage())); }
    }
    /** Android 14+: is Piyu allowed to open the alarm page over the lock screen? */
    @PluginMethod public void fullScreenStatus(PluginCall call) {
        boolean ok = true;
        try { if (Build.VERSION.SDK_INT >= 34) ok = ((android.app.NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE)).canUseFullScreenIntent(); } catch (Exception e) { }
        JSObject o = new JSObject(); o.put("allowed", ok); call.resolve(o);
    }
    @PluginMethod public void openFullScreenSettings(PluginCall call) {
        try {
            Intent i = Build.VERSION.SDK_INT >= 34 ? new Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:" + getContext().getPackageName())) : new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getContext().getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK); getContext().startActivity(i);
        } catch (Exception e) { }
        call.resolve();
    }

    /* ---------------- permissions ---------------- */
    /** everything Piyu may need, in one answer: granted / denied / prompt for mic + camera, battery, volume */
    @PluginMethod public void permStatus(PluginCall call) { call.resolve(perms()); }

    /** ask for one permission by name: "mic" | "camera" (system dialog) — battery is a settings screen — returns the new status */
    @PluginMethod public void permRequest(PluginCall call) {
        String n = call.getString("name", "");
        if ("mic".equals(n) || "camera".equals(n)) {
            if (getPermissionState(n) == PermissionState.GRANTED) { call.resolve(perms()); return; }
            requestPermissionForAlias(n, call, "permDone");
            return;
        }
        if ("battery".equals(n)) { requestBatteryExemption(call); return; }
        call.resolve(perms());
    }
    @PermissionCallback private void permDone(PluginCall call) { call.resolve(perms()); }

    /** the phone's own settings page for Piyu (the only place to turn a permission on again after "don't ask again") */
    @PluginMethod public void openAppSettings(PluginCall call) {
        try {
            Intent i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getContext().getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK); getContext().startActivity(i);
        } catch (Exception e) { }
        call.resolve();
    }

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

    /* ---------------- speaker / volume (no permission exists for the speaker: what matters is the media volume) ---------------- */
    @PluginMethod public void volumeUp(PluginCall call) {
        AudioManager am = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
        int max = am.getStreamMaxVolume(AudioManager.STREAM_MUSIC), want = Math.max(am.getStreamVolume(AudioManager.STREAM_MUSIC), Math.round(max * 0.7f));
        try { am.setStreamVolume(AudioManager.STREAM_MUSIC, want, AudioManager.FLAG_SHOW_UI); } catch (Exception e) { }
        call.resolve(perms());
    }

    /* ---------------- the phone's speech recognition (the browser one does not exist inside an Android WebView) ---------------- */
    @PluginMethod public void speechAvailable(PluginCall call) {
        JSObject o = new JSObject(); o.put("available", SpeechRecognizer.isRecognitionAvailable(getContext())); call.resolve(o);
    }
    @PluginMethod public void speechStart(PluginCall call) {
        if (getPermissionState("mic") != PermissionState.GRANTED) { requestPermissionForAlias("mic", call, "speechPermDone"); return; }
        beginSpeech(call);
    }
    @PermissionCallback private void speechPermDone(PluginCall call) {
        if (getPermissionState("mic") == PermissionState.GRANTED) beginSpeech(call); else call.reject("mic-denied");
    }
    @PluginMethod public void speechStop(PluginCall call) {
        getActivity().runOnUiThread(() -> { try { if (sr != null) sr.stopListening(); } catch (Exception e) { } });
        call.resolve();
    }
    private void beginSpeech(PluginCall call) {
        final String lang = call.getString("lang", "hi-IN");
        getActivity().runOnUiThread(() -> {
            try {
                if (sr != null) { try { sr.destroy(); } catch (Exception e) { } }
                if (!SpeechRecognizer.isRecognitionAvailable(getContext())) { call.reject("no-recognizer"); return; }
                sr = SpeechRecognizer.createSpeechRecognizer(getContext());
                Intent i = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
                i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
                i.putExtra(RecognizerIntent.EXTRA_LANGUAGE, lang);
                i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, lang);
                i.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
                i.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3);
                i.putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, getContext().getPackageName());
                sr.setRecognitionListener(new RecognitionListener() {
                    @Override public void onReadyForSpeech(Bundle b) { listening = true; JSObject o = new JSObject(); notifyListeners("speechReady", o); }
                    @Override public void onBeginningOfSpeech() { }
                    @Override public void onRmsChanged(float v) { }
                    @Override public void onBufferReceived(byte[] b) { }
                    @Override public void onEndOfSpeech() { }
                    @Override public void onError(int e) { listening = false; JSObject o = new JSObject(); o.put("code", e); notifyListeners("speechError", o); }
                    @Override public void onResults(Bundle b) { listening = false; notifyListeners("speechFinal", matches(b)); }
                    @Override public void onPartialResults(Bundle b) { notifyListeners("speechPartial", matches(b)); }
                    @Override public void onEvent(int t, Bundle b) { }
                });
                sr.startListening(i);
                call.resolve();
            } catch (Exception e) { call.reject(String.valueOf(e.getMessage())); }
        });
    }
    private JSObject matches(Bundle b) {
        JSObject o = new JSObject(); JSArray a = new JSArray();
        ArrayList<String> m = b == null ? null : b.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
        if (m != null) for (String s : m) a.put(s);
        o.put("matches", a); return o;
    }
    @Override protected void handleOnDestroy() { try { if (sr != null) sr.destroy(); } catch (Exception e) { } }

    /* ---------------- helpers ---------------- */
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
    private String st(String alias) { PermissionState s = getPermissionState(alias); return s == PermissionState.GRANTED ? "granted" : s == PermissionState.DENIED ? "denied" : "prompt"; }
    private JSObject perms() {
        Context c = getContext();
        JSObject o = state();
        o.put("mic", st("mic")); o.put("camera", st("camera"));
        AudioManager am = (AudioManager) c.getSystemService(Context.AUDIO_SERVICE);
        o.put("volume", am.getStreamVolume(AudioManager.STREAM_MUSIC)); o.put("volumeMax", am.getStreamMaxVolume(AudioManager.STREAM_MUSIC));
        o.put("ringerMode", am.getRingerMode());
        o.put("speech", SpeechRecognizer.isRecognitionAvailable(c));
        return o;
    }
}
