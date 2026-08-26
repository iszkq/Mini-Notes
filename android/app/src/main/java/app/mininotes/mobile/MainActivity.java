package app.mininotes.mobile;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;
import android.webkit.WebView;
import android.view.View;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WebView webView = getBridge().getWebView();
        if (webView != null) {
            // The web editor owns long-press behavior and displays its own
            // mobile formatting toolbar. Consume WebView long-clicks so the
            // Android copy/share/AI action bar cannot steal editor focus.
            webView.setOnLongClickListener(new View.OnLongClickListener() {
                @Override public boolean onLongClick(View view) { return true; }
            });
            webView.setLongClickable(true);
        }
    }
}
