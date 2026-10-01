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

import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;

import java.util.ArrayList;
import java.util.Locale;
import java.util.Set;

/** Piyu's own native bridge: background service, permissions (mic / camera / battery / volume), the phone's speech recognition. */
@CapacitorPlugin(
    name = "PiyuBackground",
    permissions = {
        @Permission(alias = "mic", strings = { Manifest.permission.RECORD_AUDIO }),
        @Permission(alias = "camera", strings = { Manifest.permission.CAMERA }),
        @Permission(alias = "loc", strings = { Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION }),
        @Permission(alias = "bgloc", strings = { "android.permission.ACCESS_BACKGROUND_LOCATION" })
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

    /* ---------------- the phone's own voice (Google text-to-speech): natural Indian Hindi / Indian English, plays one sentence after another without gaps ---------------- */
    private TextToSpeech tts; private boolean ttsReady = false, ttsInit = false;

    private void ttsEnsure(final Runnable then) {
        if (tts != null && ttsInit) { then.run(); return; }
        if (tts == null) {
            Context c = getContext();
            TextToSpeech.OnInitListener l = status -> {
                ttsReady = status == TextToSpeech.SUCCESS; ttsInit = true;
                if (ttsReady) {
                    try { tts.setAudioAttributes(new android.media.AudioAttributes.Builder().setUsage(android.media.AudioAttributes.USAGE_MEDIA).setContentType(android.media.AudioAttributes.CONTENT_TYPE_SPEECH).build()); } catch (Exception e) { }
                    tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                        @Override public void onStart(String id) { JSObject o = new JSObject(); o.put("id", id); notifyListeners("ttsStart", o); }
                        @Override public void onDone(String id) { JSObject o = new JSObject(); o.put("id", id); notifyListeners("ttsDone", o); }
                        @Override public void onError(String id) { JSObject o = new JSObject(); o.put("id", id); notifyListeners("ttsDone", o); }
                    });
                }
                getActivity().runOnUiThread(() -> { for (Runnable r : new ArrayList<>(ttsQueue)) r.run(); ttsQueue.clear(); });
            };
            try { tts = new TextToSpeech(c, l, "com.google.android.tts"); } catch (Exception e) { tts = new TextToSpeech(c, l); }
        }
        ttsQueue.add(then);
    }
    private final ArrayList<Runnable> ttsQueue = new ArrayList<>();

    private JSArray voiceList(String lang) {
        JSArray a = new JSArray();
        try {
            Set<Voice> vs = tts.getVoices();
            if (vs != null) for (Voice v : vs) {
                if (!lang.equalsIgnoreCase(v.getLocale().getLanguage())) continue;
                JSObject o = new JSObject(); o.put("name", v.getName()); o.put("locale", v.getLocale().toString()); o.put("quality", v.getQuality()); o.put("network", v.isNetworkConnectionRequired());
                a.put(o);
            }
        } catch (Exception e) { }
        return a;
    }
    /** which languages can the phone speak, and with which voices */
    @PluginMethod public void ttsInfo(PluginCall call) {
        getActivity().runOnUiThread(() -> ttsEnsure(() -> {
            JSObject o = new JSObject(); o.put("ready", ttsReady);
            if (ttsReady) {
                for (String l : new String[]{"hi", "en", "mr", "bn", "ur"}) {
                    JSObject x = new JSObject(); Locale loc = l.equals("en") ? new Locale("en", "IN") : new Locale(l, l.equals("ur") ? "IN" : "IN");
                    int r = tts.isLanguageAvailable(loc); x.put("ok", r >= TextToSpeech.LANG_AVAILABLE); x.put("voices", voiceList(l)); o.put(l, x);
                }
                try { o.put("engine", tts.getDefaultEngine()); } catch (Exception e) { }
            }
            call.resolve(o);
        }));
    }
    /** speak: { id, text, lang: "hi"|"en"|..., voice?: voice name, rate, pitch, flush } — sentences sent with flush=false are queued behind each other */
    @PluginMethod public void ttsSpeak(PluginCall call) {
        final String text = call.getString("text", ""), id = call.getString("id", "u" + System.nanoTime()), lang = call.getString("lang", "hi"), voice = call.getString("voice", "");
        final float rate = call.getFloat("rate", 1f), pitch = call.getFloat("pitch", 1f); final boolean flush = call.getBoolean("flush", false);
        getActivity().runOnUiThread(() -> ttsEnsure(() -> {
            if (!ttsReady) { call.reject("no-tts"); return; }
            try {
                Locale loc = lang.equals("en") ? new Locale("en", "IN") : new Locale(lang, "IN");
                boolean set = false;
                if (!voice.isEmpty()) { try { for (Voice v : tts.getVoices()) if (v.getName().equals(voice)) { tts.setVoice(v); set = true; break; } } catch (Exception e) { } }
                if (!set) tts.setLanguage(loc);
                tts.setSpeechRate(Math.max(0.5f, Math.min(2f, rate))); tts.setPitch(Math.max(0.5f, Math.min(2f, pitch)));
                int r = tts.speak(text, flush ? TextToSpeech.QUEUE_FLUSH : TextToSpeech.QUEUE_ADD, null, id);
                if (r != TextToSpeech.SUCCESS) { call.reject("speak-failed"); return; }
                call.resolve();
            } catch (Exception e) { call.reject(String.valueOf(e.getMessage())); }
        }));
    }
    @PluginMethod public void ttsStop(PluginCall call) {
        getActivity().runOnUiThread(() -> { try { if (tts != null) tts.stop(); } catch (Exception e) { } call.resolve(); });
    }
    @PluginMethod public void ttsOpenSettings(PluginCall call) {      // install / download the Hindi voice data
        try { Intent i = new Intent("com.android.settings.TTS_SETTINGS"); i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK); getContext().startActivity(i); } catch (Exception e) { }
        call.resolve();
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
        if ("mic".equals(n) || "camera".equals(n) || "loc".equals(n) || "bgloc".equals(n)) {
            if ("bgloc".equals(n) && Build.VERSION.SDK_INT < 29) { call.resolve(perms()); return; }
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
    @Override protected void handleOnDestroy() { try { if (sr != null) sr.destroy(); } catch (Exception e) { } try { if (tts != null) tts.shutdown(); } catch (Exception e) { } }

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
    /* ---------------- Piyu Family: child location sharing (only while the parent has it ON) + parent alerts ---------------- */
    /** { server, token, device, loc: bool, alerts: bool, every: minutes, since: lastAlertId, texts } — saves what the service needs and starts / stops it */
    @PluginMethod public void famStart(PluginCall call) {
        Context c = getContext();
        android.content.SharedPreferences.Editor e = PiyuFamilyService.prefs(c).edit();
        e.putString("server", call.getString("server", "")).putString("token", call.getString("token", "")).putString("device", call.getString("device", ""))
         .putBoolean("loc", Boolean.TRUE.equals(call.getBoolean("loc", false))).putBoolean("alerts", Boolean.TRUE.equals(call.getBoolean("alerts", false)))
         .putInt("every", Math.max(1, Math.min(10, call.getInt("every", 2))));
        if (call.hasOption("since")) e.putLong("since", call.getData().optLong("since", 0));
        if (call.hasOption("msgSince")) e.putLong("msgSince", call.getData().optLong("msgSince", 0));
        if (call.hasOption("locTitle")) e.putString("locTitle", call.getString("locTitle", ""));
        if (call.hasOption("locText")) e.putString("locText", call.getString("locText", ""));
        if (call.hasOption("famTitle")) e.putString("famTitle", call.getString("famTitle", ""));
        if (call.hasOption("famText")) e.putString("famText", call.getString("famText", ""));
        if (call.hasOption("msgTitle")) e.putString("msgTitle", call.getString("msgTitle", ""));
        e.putString("err", "").apply();
        if (PiyuFamilyService.wanted(c)) { try { PiyuFamilyService.start(c); } catch (Exception ex) { call.reject(String.valueOf(ex.getMessage())); return; } }
        else c.stopService(new Intent(c, PiyuFamilyService.class));
        call.resolve(famState());
    }
    @PluginMethod public void famStop(PluginCall call) {
        Context c = getContext();
        PiyuFamilyService.prefs(c).edit().putBoolean("loc", false).putBoolean("alerts", false).apply();
        c.stopService(new Intent(c, PiyuFamilyService.class));
        call.resolve(famState());
    }
    @PluginMethod public void famStatus(PluginCall call) { call.resolve(famState()); }
    private JSObject famState() {
        android.content.SharedPreferences p = PiyuFamilyService.prefs(getContext());
        JSObject o = new JSObject();
        o.put("loc", p.getBoolean("loc", false)); o.put("alerts", p.getBoolean("alerts", false)); o.put("lastPost", p.getLong("lastPost", 0)); o.put("lastCode", p.getInt("lastCode", 0));
        o.put("err", p.getString("err", "")); o.put("since", p.getLong("since", 0));
        try { android.location.LocationManager lm = (android.location.LocationManager) getContext().getSystemService(Context.LOCATION_SERVICE); o.put("gpsOn", lm.isProviderEnabled(android.location.LocationManager.GPS_PROVIDER) || lm.isProviderEnabled(android.location.LocationManager.NETWORK_PROVIDER)); } catch (Exception e) { o.put("gpsOn", false); }
        return o;
    }
    /** where is this phone right now (used by the parent to set Home / School on the spot) */
    @PluginMethod public void locOnce(PluginCall call) {
        if (getPermissionState("loc") != PermissionState.GRANTED) { requestPermissionForAlias("loc", call, "locOnceDone"); return; }
        doLocOnce(call);
    }
    @PermissionCallback private void locOnceDone(PluginCall call) {
        if (getPermissionState("loc") == PermissionState.GRANTED) doLocOnce(call); else call.reject("denied");
    }
    private void doLocOnce(final PluginCall call) {
        final android.location.LocationManager lm = (android.location.LocationManager) getContext().getSystemService(Context.LOCATION_SERVICE);
        final android.location.Location[] best = { null };
        final boolean[] done = { false };
        final android.os.Handler hd = new android.os.Handler(android.os.Looper.getMainLooper());
        final Runnable finish = new Runnable() { @Override public void run() {
            if (done[0]) return; done[0] = true;
            if (best[0] == null) { call.reject("nofix"); return; }
            JSObject o = new JSObject(); o.put("lat", best[0].getLatitude()); o.put("lng", best[0].getLongitude()); o.put("acc", best[0].getAccuracy()); o.put("at", best[0].getTime()); call.resolve(o);
        } };
        try {
            for (String pv : new String[]{ android.location.LocationManager.GPS_PROVIDER, android.location.LocationManager.NETWORK_PROVIDER }) {
                try {
                    android.location.Location l = lm.getLastKnownLocation(pv);
                    if (l != null && (best[0] == null || l.getTime() > best[0].getTime())) best[0] = l;
                    if (lm.isProviderEnabled(pv)) lm.requestSingleUpdate(pv, new android.location.LocationListener() {
                        @Override public void onLocationChanged(android.location.Location x) { if (best[0] == null || x.getAccuracy() <= best[0].getAccuracy() || x.getTime() > best[0].getTime() + 60000) best[0] = x; hd.post(finish); }
                        @Override public void onStatusChanged(String a, int b, Bundle c) { }
                        @Override public void onProviderEnabled(String a) { }
                        @Override public void onProviderDisabled(String a) { }
                    }, android.os.Looper.getMainLooper());
                } catch (SecurityException | IllegalArgumentException e) { }
            }
        } catch (Exception e) { }
        hd.postDelayed(finish, 15000);
    }

    private JSObject perms() {
        Context c = getContext();
        JSObject o = state();
        o.put("mic", st("mic")); o.put("camera", st("camera")); o.put("loc", st("loc")); o.put("bgloc", Build.VERSION.SDK_INT < 29 ? st("loc") : st("bgloc"));
        AudioManager am = (AudioManager) c.getSystemService(Context.AUDIO_SERVICE);
        o.put("volume", am.getStreamVolume(AudioManager.STREAM_MUSIC)); o.put("volumeMax", am.getStreamMaxVolume(AudioManager.STREAM_MUSIC));
        o.put("ringerMode", am.getRingerMode());
        o.put("speech", SpeechRecognizer.isRecognitionAvailable(c));
        return o;
    }
}
