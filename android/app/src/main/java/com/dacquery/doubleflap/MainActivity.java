package com.dacquery.doubleflap;

import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Draw edge-to-edge. On Android 15+ (targetSdk 35+) the system enforces
        // this, and by default the WebView gets padded into the "safe area"
        // between the status and navigation bars. Setting
        // decorFitsSystemWindows(false) + handling the insets below makes the
        // WebView actually fill the whole screen.
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);

        // Extend content into the display cutout / notch area too, so hiding
        // the status bar doesn't shrink the usable width on notched phones.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            WindowManager.LayoutParams attrs = getWindow().getAttributes();
            attrs.layoutInDisplayCutoutMode =
                WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            getWindow().setAttributes(attrs);
        }

        // Zero out the system-bar insets so the WebView is not padded away from
        // the screen edges, and CONSUME them so Capacitor's own inset handling
        // can't re-add padding. Deviation from Boba Quest: the IME (keyboard)
        // inset IS applied as bottom padding — Double Flap's leaderboard name
        // entry is a VISIBLE input card that pins itself above the keyboard via
        // the VisualViewport API, which only works if the WebView shrinks when
        // the keyboard opens (Boba Quest types into a hidden input and never
        // needs the resize). With the keyboard closed the padding is 0 —
        // identical to Boba Quest's full-screen behavior.
        final View content = findViewById(android.R.id.content);
        if (content != null) {
            ViewCompat.setOnApplyWindowInsetsListener(content, (v, insets) -> {
                Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime());
                v.setPadding(0, 0, 0, ime.bottom);
                return WindowInsetsCompat.CONSUMED;
            });
        }

        enableImmersiveMode();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        // Re-apply when focus returns (e.g. after the soft keyboard or a
        // transient system-bar swipe) so the game stays fullscreen.
        if (hasFocus) {
            enableImmersiveMode();
        }
    }

    private void enableImmersiveMode() {
        WindowInsetsControllerCompat controller =
            new WindowInsetsControllerCompat(getWindow(), getWindow().getDecorView());
        // Hide both the status bar and the navigation bar for a fullscreen game.
        controller.hide(WindowInsetsCompat.Type.systemBars());
        // Bars reappear briefly on an edge swipe, then auto-hide again.
        controller.setSystemBarsBehavior(
            WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
    }
}
