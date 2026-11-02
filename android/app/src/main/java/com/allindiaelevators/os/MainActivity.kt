package com.allindiaelevators.os

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.app.DownloadManager
import android.content.ActivityNotFoundException
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.print.PrintManager
import android.provider.MediaStore
import android.util.Base64
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.webkit.GeolocationPermissions
import android.webkit.JavascriptInterface
import android.webkit.PermissionRequest
import android.webkit.URLUtil
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import java.io.File
import java.io.FileOutputStream

/**
 * AIEC Elevator OS for Android: the live web app, full screen, with the phone features a browser page cannot reach
 * on its own — camera, microphone and GPS permissions, phone/WhatsApp/SMS/maps links opened in their own apps,
 * saving backup files to Downloads, printing to PDF, opening files, and the back button.
 * The web app itself (rules, data, languages, offline working) is unchanged and updates by itself from GitHub.
 */
class MainActivity : Activity() {

    companion object {
        const val HOST = "prashantashwable-cmyk.github.io"
        const val PATH = "/UNLIT-GPT-HTML"
        const val START_URL = "https://$HOST$PATH/AIEC-Elevator-OS.html"
        private const val REQ_WEB_PERMS = 11
        private const val REQ_GEO = 12
        private const val REQ_FILE = 13
        private const val REQ_STORAGE = 14
    }

    private lateinit var web: WebView
    private lateinit var offline: View
    private var pendingWebRequest: PermissionRequest? = null
    private var pendingGeo: Pair<String, GeolocationPermissions.Callback>? = null
    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private var pendingSave: Triple<String, String, ByteArray>? = null
    private var lastBack = 0L

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val root = FrameLayout(this)
        web = WebView(this)
        offline = buildOfflineView()
        offline.visibility = View.GONE
        root.addView(web, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        root.addView(offline, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        setContentView(root)
        goFullScreen()

        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            @Suppress("DEPRECATION")
            databaseEnabled = true
            mediaPlaybackRequiresUserGesture = false
            setGeolocationEnabled(true)
            allowFileAccess = false
            allowContentAccess = true
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            cacheMode = WebSettings.LOAD_DEFAULT
            /* the web app reads this tag to know it runs inside the installed Android app */
            userAgentString = "$userAgentString AIECAndroid/${BuildConfigLite.VERSION}"
        }
        web.addJavascriptInterface(Bridge(), "AIECAndroid")
        web.webViewClient = Client()
        web.webChromeClient = Chrome()
        web.setDownloadListener { url, _, contentDisposition, mimeType, _ ->
            /* backups are saved through the bridge; real web downloads go to the phone's download manager */
            if (url.startsWith("http")) {
                try {
                    val name = URLUtil.guessFileName(url, contentDisposition, mimeType)
                    val req = DownloadManager.Request(Uri.parse(url))
                        .setMimeType(mimeType)
                        .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                        .setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name)
                    (getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager).enqueue(req)
                    toast(getString(R.string.saved, name))
                } catch (e: Exception) {
                    toast(getString(R.string.save_failed))
                }
            }
        }

        if (savedInstanceState != null) web.restoreState(savedInstanceState)
        else web.loadUrl(startUrlFrom(intent))
    }

    /* a lift QR sticker or join link opened from another app lands on that page inside the app */
    private fun startUrlFrom(i: Intent?): String {
        val u = i?.data ?: return START_URL
        return if (u.scheme == "https" && u.host == HOST && (u.path ?: "").startsWith(PATH)) u.toString() else START_URL
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        if (intent.data != null) web.loadUrl(startUrlFrom(intent))
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        web.saveState(outState)
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) goFullScreen()
    }

    @Suppress("DEPRECATION")
    private fun goFullScreen() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.setDecorFitsSystemWindows(false)
            window.insetsController?.let {
                it.hide(WindowInsets.Type.statusBars() or WindowInsets.Type.navigationBars())
                it.systemBarsBehavior = WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            }
        } else {
            window.decorView.systemUiVisibility = (View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY or View.SYSTEM_UI_FLAG_FULLSCREEN
                or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION)
        }
    }

    @Deprecated("Back inside the app first; a second press on the first page closes it")
    override fun onBackPressed() {
        if (offline.visibility == View.VISIBLE) { super.onBackPressed(); return }
        if (web.canGoBack()) { web.goBack(); return }
        val now = System.currentTimeMillis()
        if (now - lastBack < 2000) super.onBackPressed() else { lastBack = now; toast(getString(R.string.press_again)) }
    }

    private fun toast(msg: String) = runOnUiThread { Toast.makeText(this, msg, Toast.LENGTH_LONG).show() }

    private fun has(p: String) = checkSelfPermission(p) == PackageManager.PERMISSION_GRANTED

    private fun buildOfflineView(): View {
        val box = LinearLayout(this)
        box.orientation = LinearLayout.VERTICAL
        box.gravity = Gravity.CENTER
        box.setBackgroundColor(Color.parseColor("#F4F2ED"))
        box.setPadding(48, 48, 48, 48)
        val icon = TextView(this).apply { text = "🛗"; textSize = 56f; gravity = Gravity.CENTER }
        val title = TextView(this).apply { text = getString(R.string.offline_title); textSize = 24f; gravity = Gravity.CENTER; setTextColor(Color.parseColor("#1B1F2A")) }
        val body = TextView(this).apply { text = getString(R.string.offline_text); textSize = 18f; gravity = Gravity.CENTER; setTextColor(Color.parseColor("#545C6B")); setPadding(0, 24, 0, 32) }
        val retry = Button(this).apply {
            text = getString(R.string.retry); textSize = 20f
            setOnClickListener { offline.visibility = View.GONE; web.reload() }
        }
        box.addView(icon); box.addView(title); box.addView(body); box.addView(retry)
        return box
    }

    /* ---------- links: the app's own site stays inside, everything else opens in its own phone app ---------- */
    private inner class Client : WebViewClient() {
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
            val u = request.url
            if (u.scheme == "https" && u.host == HOST && (u.path ?: "").startsWith(PATH)) return false
            openOutside(u)
            return true
        }

        override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
            if (request.isForMainFrame) offline.visibility = View.VISIBLE
        }

        override fun onPageFinished(view: WebView, url: String) {
            if (offline.visibility == View.VISIBLE && url.startsWith("https://$HOST")) offline.visibility = View.GONE
        }
    }

    private fun openOutside(u: Uri) {
        try {
            if (u.scheme == "intent") {
                val i = Intent.parseUri(u.toString(), Intent.URI_INTENT_SCHEME)
                try { startActivity(i) } catch (e: ActivityNotFoundException) {
                    val fb = i.getStringExtra("browser_fallback_url")
                    if (fb != null) startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(fb))) else toast(getString(R.string.no_app))
                }
                return
            }
            val i = if (u.scheme == "tel") Intent(Intent.ACTION_DIAL, u) else if (u.scheme == "sms" || u.scheme == "smsto" || u.scheme == "mailto") Intent(Intent.ACTION_SENDTO, u) else Intent(Intent.ACTION_VIEW, u)
            startActivity(i)
        } catch (e: Exception) {
            toast(getString(R.string.no_app))
        }
    }

    /* ---------- camera, microphone, location and files for the page ---------- */
    private inner class Chrome : WebChromeClient() {
        override fun onPermissionRequest(request: PermissionRequest) {
            runOnUiThread {
                val need = mutableListOf<String>()
                for (r in request.resources) {
                    if (r == PermissionRequest.RESOURCE_VIDEO_CAPTURE && !has(Manifest.permission.CAMERA)) need += Manifest.permission.CAMERA
                    if (r == PermissionRequest.RESOURCE_AUDIO_CAPTURE && !has(Manifest.permission.RECORD_AUDIO)) need += Manifest.permission.RECORD_AUDIO
                }
                if (need.isEmpty()) request.grant(request.resources)
                else { pendingWebRequest = request; requestPermissions(need.toTypedArray(), REQ_WEB_PERMS) }
            }
        }

        override fun onGeolocationPermissionsShowPrompt(origin: String, callback: GeolocationPermissions.Callback) {
            if (has(Manifest.permission.ACCESS_FINE_LOCATION) || has(Manifest.permission.ACCESS_COARSE_LOCATION)) callback.invoke(origin, true, false)
            else { pendingGeo = origin to callback; requestPermissions(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION), REQ_GEO) }
        }

        override fun onShowFileChooser(view: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
            fileCallback?.onReceiveValue(null)
            fileCallback = callback
            return try { startActivityForResult(params.createIntent(), REQ_FILE); true } catch (e: Exception) { fileCallback = null; false }
        }
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        val ok = grantResults.isNotEmpty() && grantResults.all { it == PackageManager.PERMISSION_GRANTED }
        when (requestCode) {
            REQ_WEB_PERMS -> pendingWebRequest?.let { r ->
                val allowed = r.resources.filter {
                    (it == PermissionRequest.RESOURCE_VIDEO_CAPTURE && has(Manifest.permission.CAMERA)) || (it == PermissionRequest.RESOURCE_AUDIO_CAPTURE && has(Manifest.permission.RECORD_AUDIO))
                }
                if (allowed.isNotEmpty()) r.grant(allowed.toTypedArray()) else { r.deny(); toast(getString(R.string.perm_needed)) }
                pendingWebRequest = null
            }
            REQ_GEO -> pendingGeo?.let { (origin, cb) ->
                val any = has(Manifest.permission.ACCESS_FINE_LOCATION) || has(Manifest.permission.ACCESS_COARSE_LOCATION)
                cb.invoke(origin, any, false); if (!any) toast(getString(R.string.perm_needed)); pendingGeo = null
            }
            REQ_STORAGE -> pendingSave?.let { (name, mime, bytes) -> if (ok) writeDownload(name, mime, bytes) else toast(getString(R.string.save_failed)); pendingSave = null }
        }
    }

    @Deprecated("Activity result for the page's file picker")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == REQ_FILE) { fileCallback?.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data)); fileCallback = null }
    }

    /* ---------- the bridge the web app calls: save a file, print the page ---------- */
    private inner class Bridge {
        @JavascriptInterface
        fun saveFile(name: String, mime: String, base64: String) {
            val safe = name.replace(Regex("[^A-Za-z0-9._ -]"), "_").take(120).ifBlank { "aiec-file" }
            val bytes = try { Base64.decode(base64, Base64.DEFAULT) } catch (e: Exception) { toast(getString(R.string.save_failed)); return }
            runOnUiThread {
                if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q && !has(Manifest.permission.WRITE_EXTERNAL_STORAGE)) {
                    pendingSave = Triple(safe, mime, bytes); requestPermissions(arrayOf(Manifest.permission.WRITE_EXTERNAL_STORAGE), REQ_STORAGE)
                } else writeDownload(safe, mime, bytes)
            }
        }

        @JavascriptInterface
        fun print(title: String) {
            runOnUiThread {
                val pm = getSystemService(Context.PRINT_SERVICE) as PrintManager
                val job = title.ifBlank { "AIEC" }
                pm.print(job, web.createPrintDocumentAdapter(job), null)
            }
        }

        @JavascriptInterface
        fun version(): String = BuildConfigLite.VERSION
    }

    private fun writeDownload(name: String, mime: String, bytes: ByteArray) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val values = ContentValues().apply {
                    put(MediaStore.Downloads.DISPLAY_NAME, name)
                    put(MediaStore.Downloads.MIME_TYPE, mime)
                    put(MediaStore.Downloads.IS_PENDING, 1)
                }
                val uri = contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values) ?: throw IllegalStateException("no uri")
                contentResolver.openOutputStream(uri)?.use { it.write(bytes) }
                values.clear(); values.put(MediaStore.Downloads.IS_PENDING, 0)
                contentResolver.update(uri, values, null, null)
            } else {
                @Suppress("DEPRECATION")
                val dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
                dir.mkdirs()
                FileOutputStream(File(dir, name)).use { it.write(bytes) }
            }
            toast(getString(R.string.saved, name))
        } catch (e: Exception) {
            toast(getString(R.string.save_failed))
        }
    }
}

/* version shown to the web app (kept here so the project needs no generated BuildConfig) */
object BuildConfigLite {
    const val VERSION = "1.0"
}
