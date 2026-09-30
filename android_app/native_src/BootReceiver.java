package in.piyu.assistant;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** After a phone restart / app update, bring the background service back if the user is still logged in. */
public class BootReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context c, Intent i) {
        String a = i.getAction();
        if (Intent.ACTION_BOOT_COMPLETED.equals(a) || Intent.ACTION_MY_PACKAGE_REPLACED.equals(a) || "android.intent.action.QUICKBOOT_POWERON".equals(a)) {
            if (PiyuService.wanted(c)) { try { PiyuService.start(c); } catch (Exception e) { } }
        }
    }
}
