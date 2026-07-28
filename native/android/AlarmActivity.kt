package com.genba.alarm

import android.app.Activity
import android.app.NotificationManager
import android.graphics.Color
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.WindowManager
import android.widget.*
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class AlarmActivity : Activity() {
    private var ringtone: android.media.Ringtone? = null
    private var vibrator: android.os.Vibrator? = null
    private val handler = Handler(Looper.getMainLooper())
    private var clockView: TextView? = null
    private val clockTick = object : Runnable {
        override fun run() {
            clockView?.text = SimpleDateFormat("HH:mm", Locale.getDefault()).format(Date())
            handler.postDelayed(this, 1000)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        }
        window.addFlags(
            WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON or
            WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD
        )
        @Suppress("DEPRECATION")
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O_MR1) {
            window.addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
            )
        }

        val label = intent.getStringExtra("label") ?: "アラーム"
        val alarmId = intent.getIntExtra("alarmId", 0)
        val ringtoneUri = intent.getStringExtra("ringtoneUri") ?: ""

        buildUI(label, alarmId)
        startAlarmSound(ringtoneUri)
        startVibration()
    }

    private fun buildUI(label: String, alarmId: Int) {
        val dp = resources.displayMetrics.density

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setBackgroundColor(Color.parseColor("#1A1A2E"))
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.MATCH_PARENT
            )
        }

        val icon = TextView(this).apply {
            text = "⏰"
            textSize = 56f
            gravity = Gravity.CENTER
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).also { it.bottomMargin = (8 * dp).toInt() }
        }

        val currentClock = TextView(this).apply {
            text = SimpleDateFormat("HH:mm", Locale.getDefault()).format(Date())
            textSize = 80f
            setTextColor(Color.WHITE)
            gravity = Gravity.CENTER
            letterSpacing = 0.05f
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).also { it.bottomMargin = (4 * dp).toInt() }
        }
        clockView = currentClock

        val wakeLabel = TextView(this).apply {
            text = "起床 $label"
            textSize = 22f
            setTextColor(Color.parseColor("#7BA7FF"))
            gravity = Gravity.CENTER
            letterSpacing = 0.03f
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).also { it.bottomMargin = (8 * dp).toInt() }
        }

        val appLabel = TextView(this).apply {
            text = "GENBAAlarm"
            textSize = 14f
            setTextColor(Color.parseColor("#8888AA"))
            gravity = Gravity.CENTER
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).also { it.bottomMargin = (64 * dp).toInt() }
        }

        val stopBtn = Button(this).apply {
            text = "止める"
            textSize = 22f
            setTextColor(Color.WHITE)
            setBackgroundColor(Color.parseColor("#4A6CF7"))
            layoutParams = LinearLayout.LayoutParams(
                (220 * dp).toInt(), (64 * dp).toInt()
            )
        }
        stopBtn.setOnClickListener { stopAndFinish(alarmId) }

        root.addView(icon)
        root.addView(currentClock)
        root.addView(wakeLabel)
        root.addView(appLabel)
        root.addView(stopBtn)
        setContentView(root)

        handler.post(clockTick)
    }

    private fun startAlarmSound(ringtoneUri: String = "") {
        val uri = if (ringtoneUri.isNotEmpty()) {
            android.net.Uri.parse(ringtoneUri)
        } else {
            RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
                ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
        }
        ringtone = RingtoneManager.getRingtone(applicationContext, uri)
        ringtone?.audioAttributes = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ALARM)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            ringtone?.isLooping = true
        }
        ringtone?.play()
    }

    private fun startVibration() {
        val v: android.os.Vibrator = if (Build.VERSION.SDK_INT >= 31) {
            val vm = getSystemService(android.content.Context.VIBRATOR_MANAGER_SERVICE) as android.os.VibratorManager
            vm.defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            getSystemService(android.content.Context.VIBRATOR_SERVICE) as android.os.Vibrator
        }
        vibrator = v
        val pattern = longArrayOf(0, 1000, 500)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val attrs = AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ALARM)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build()
            @Suppress("DEPRECATION")
            v.vibrate(android.os.VibrationEffect.createWaveform(pattern, 0), attrs)
        } else {
            @Suppress("DEPRECATION")
            v.vibrate(pattern, 0)
        }
    }

    private fun stopAndFinish(alarmId: Int) {
        handler.removeCallbacks(clockTick)
        ringtone?.stop()
        ringtone = null
        vibrator?.cancel()
        vibrator = null
        (getSystemService(NOTIFICATION_SERVICE) as NotificationManager).cancel(alarmId)
        AlarmStore.removeAlarm(applicationContext, alarmId)
        finish()
    }

    override fun onDestroy() {
        super.onDestroy()
        handler.removeCallbacks(clockTick)
        ringtone?.stop()
        vibrator?.cancel()
    }
}
