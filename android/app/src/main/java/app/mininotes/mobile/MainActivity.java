package app.mininotes.mobile;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;
import android.view.ActionMode;
import android.webkit.WebView;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WebView webView = getBridge().getWebView();
        if (webView != null) {
            // Keep text selection handles, but suppress Android's native
            // copy/share/AI contextual action bar. Formatting actions are
            // provided by the BlockNote toolbar in the WebView.
            webView.setCustomSelectionActionModeCallback(new ActionMode.Callback() {
                @Override public boolean onCreateActionMode(ActionMode mode, android.view.Menu menu) { return false; }
                @Override public boolean onPrepareActionMode(ActionMode mode, android.view.Menu menu) { return false; }
                @Override public boolean onActionItemClicked(ActionMode mode, android.view.MenuItem item) { return false; }
                @Override public void onDestroyActionMode(ActionMode mode) { }
            });
        }
    }
}
