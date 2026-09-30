package in.piyu.assistant;

import android.animation.Animator;
import android.animation.AnimatorListenerAdapter;
import android.animation.ObjectAnimator;
import android.animation.ValueAnimator;
import android.app.Activity;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.view.animation.DecelerateInterpolator;
import android.view.animation.LinearInterpolator;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextClock;
import android.widget.TextView;

import org.json.JSONObject;

/** The ringing-alarm screen: opens over the lock screen and lights the display; pulsing rings, a shaking bell, big clock, task and two big buttons. */
public class AlarmActivity extends Activity {
    private JSONObject a = new JSONObject();
    private final BroadcastReceiver stopped = new BroadcastReceiver() { @Override public void onReceive(Context c, Intent i) { finishAndRemoveTask(); } };

    private int dp(float v) { return Math.round(v * getResources().getDisplayMetrics().density); }
    private GradientDrawable round(int color, float r) { GradientDrawable g = new GradientDrawable(); g.setColor(color); g.setCornerRadius(dp(r)); return g; }

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        if (Build.VERSION.SDK_INT >= 27) { setShowWhenLocked(true); setTurnScreenOn(true); }
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON | WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON | WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD);
        getWindow().setStatusBarColor(Color.TRANSPARENT); getWindow().setNavigationBarColor(Color.TRANSPARENT);
        try { a = new JSONObject(getIntent().getStringExtra("alarm")); } catch (Exception e) { }
        build();
        IntentFilter f = new IntentFilter(AlarmService.STOPPED);
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(stopped, f, Context.RECEIVER_NOT_EXPORTED); else registerReceiver(stopped, f);
    }
    @Override protected void onNewIntent(Intent i) { super.onNewIntent(i); setIntent(i); try { a = new JSONObject(i.getStringExtra("alarm")); } catch (Exception e) { } build(); }
    @Override protected void onDestroy() { try { unregisterReceiver(stopped); } catch (Exception e) { } super.onDestroy(); }
    @Override public void onBackPressed() { }                  // the alarm is ended only with the buttons

    private void send(String action) {
        startService(new Intent(this, AlarmService.class).setAction(action).putExtra("alarm", a.toString()));
        finishAndRemoveTask();
    }

    private void build() {
        FrameLayout root = new FrameLayout(this);
        GradientDrawable bg = new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM, new int[]{ Color.parseColor("#1b1147"), Color.parseColor("#3a1c71"), Color.parseColor("#d76d77") });
        root.setBackground(bg);
        LinearLayout col = new LinearLayout(this); col.setOrientation(LinearLayout.VERTICAL); col.setGravity(Gravity.CENTER_HORIZONTAL);
        col.setPadding(dp(24), dp(64), dp(24), dp(40));
        root.addView(col, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        TextView app = text("Piyu", 15, Color.parseColor("#ddd6fe"), false); app.setLetterSpacing(0.3f); col.addView(app);
        TextClock clock = new TextClock(this); clock.setFormat12Hour("hh:mm"); clock.setFormat24Hour("HH:mm"); clock.setTextSize(64); clock.setTextColor(Color.WHITE); clock.setTypeface(Typeface.create("sans-serif-light", Typeface.NORMAL)); clock.setGravity(Gravity.CENTER);
        col.addView(clock);

        // pulsing rings + shaking bell
        FrameLayout stage = new FrameLayout(this);
        LinearLayout.LayoutParams sp = new LinearLayout.LayoutParams(dp(260), dp(260)); sp.topMargin = dp(10); col.addView(stage, sp);
        for (int i = 0; i < 3; i++) {
            View ring = new View(this); GradientDrawable g = new GradientDrawable(); g.setShape(GradientDrawable.OVAL); g.setColor(Color.argb(70, 255, 255, 255)); ring.setBackground(g);
            stage.addView(ring, new FrameLayout.LayoutParams(dp(130), dp(130), Gravity.CENTER));
            ValueAnimator v = ValueAnimator.ofFloat(0f, 1f); v.setDuration(2400); v.setRepeatCount(ValueAnimator.INFINITE); v.setInterpolator(new LinearInterpolator()); v.setStartDelay(i * 800L);
            v.addUpdateListener(u -> { float t = (float) u.getAnimatedValue(); float s = 0.7f + 1.3f * t; ring.setScaleX(s); ring.setScaleY(s); ring.setAlpha(1f - t); });
            v.start();
        }
        TextView bell = text("⏰", 84, Color.WHITE, false); bell.setGravity(Gravity.CENTER);
        stage.addView(bell, new FrameLayout.LayoutParams(dp(130), dp(130), Gravity.CENTER));
        bell.setPivotX(dp(65)); bell.setPivotY(dp(30));
        ObjectAnimator shake = ObjectAnimator.ofFloat(bell, "rotation", -14f, 14f); shake.setDuration(120); shake.setRepeatCount(ValueAnimator.INFINITE); shake.setRepeatMode(ValueAnimator.REVERSE); shake.start();
        ObjectAnimator beat = ObjectAnimator.ofPropertyValuesHolder(bell, android.animation.PropertyValuesHolder.ofFloat("scaleX", 1f, 1.12f), android.animation.PropertyValuesHolder.ofFloat("scaleY", 1f, 1.12f)); beat.setDuration(450); beat.setRepeatCount(ValueAnimator.INFINITE); beat.setRepeatMode(ValueAnimator.REVERSE); beat.start();

        TextView title = text(a.optString("title", "Piyu"), 18, Color.parseColor("#e9d5ff"), false); title.setGravity(Gravity.CENTER); col.addView(title);
        TextView body = text(a.optString("body", ""), 26, Color.WHITE, true); body.setGravity(Gravity.CENTER); body.setMaxLines(5); body.setPadding(0, dp(10), 0, 0); col.addView(body);
        View sp2 = new View(this); col.addView(sp2, new LinearLayout.LayoutParams(1, 0, 1f));

        TextView done = button(a.optString("doneLbl", "✔ Done"), Color.parseColor("#22c55e"), Color.WHITE, 22);
        TextView snz = button(a.optString("snoozeLbl", "Snooze 5 min"), Color.argb(50, 255, 255, 255), Color.WHITE, 18);
        done.setOnClickListener(v -> send(AlarmService.ACT_DONE)); snz.setOnClickListener(v -> send(AlarmService.ACT_SNOOZE));
        LinearLayout.LayoutParams bp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(64)); bp.topMargin = dp(12);
        col.addView(done, bp); col.addView(snz, new LinearLayout.LayoutParams(bp));
        TextView stop = text(a.optString("stopLbl", "Stop"), 14, Color.parseColor("#ddd6fe"), false); stop.setGravity(Gravity.CENTER); stop.setPadding(dp(16), dp(14), dp(16), dp(4)); stop.setOnClickListener(v -> send(AlarmService.ACT_STOP)); col.addView(stop, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        // entry: the text fades in, the buttons rise from below; the Done button breathes so it is easy to find
        for (View v : new View[]{ title, body }) { v.setAlpha(0f); v.animate().alpha(1f).setDuration(600).setStartDelay(150).start(); }
        for (View v : new View[]{ done, snz }) { v.setTranslationY(dp(120)); v.setAlpha(0f); v.animate().translationY(0).alpha(1f).setDuration(520).setStartDelay(300).setInterpolator(new DecelerateInterpolator()).start(); }
        ObjectAnimator br = ObjectAnimator.ofPropertyValuesHolder(done, android.animation.PropertyValuesHolder.ofFloat("scaleX", 1f, 1.04f), android.animation.PropertyValuesHolder.ofFloat("scaleY", 1f, 1.04f)); br.setDuration(700); br.setRepeatCount(ValueAnimator.INFINITE); br.setRepeatMode(ValueAnimator.REVERSE); br.setStartDelay(900); br.start();
        setContentView(root);
    }

    private TextView text(String s, float sp, int color, boolean bold) { TextView t = new TextView(this); t.setText(s); t.setTextSize(sp); t.setTextColor(color); if (bold) t.setTypeface(Typeface.DEFAULT_BOLD); return t; }
    private TextView button(String s, int bg, int fg, float sp) {
        TextView t = text(s, sp, fg, true); t.setGravity(Gravity.CENTER); t.setBackground(round(bg, 32)); t.setClickable(true); t.setFocusable(true); return t;
    }
}
