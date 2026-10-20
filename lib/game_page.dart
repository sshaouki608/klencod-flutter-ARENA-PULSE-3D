import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_android/webview_flutter_android.dart';

import 'common.dart';

const List<String> kAbilityNames = ['DASH', 'SHIELD', 'PULSE', 'SLOW-MO'];
const List<IconData> kAbilityIcons = [
  Icons.double_arrow,
  Icons.shield,
  Icons.flash_on,
  Icons.hourglass_bottom,
];

class GamePage extends StatefulWidget {
  const GamePage({super.key, required this.difficulty});

  final int difficulty;

  @override
  State<GamePage> createState() => _GamePageState();
}

class _GamePageState extends State<GamePage> with WidgetsBindingObserver {
  late final WebViewController _wc;
  bool _ready = false;
  bool _paused = false;
  String? _error;
  String? _result; // 'win' | 'lose'
  double _hp = 100;
  double _ehp = 100;
  double _cd = 0;
  int _sel = 0;
  int _lastX = 0;
  int _lastY = 0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _wc = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(Colors.black)
      ..addJavaScriptChannel('Flutter', onMessageReceived: _onMessage);
    final p = _wc.platform;
    if (p is AndroidWebViewController) {
      p.setMediaPlaybackRequiresUserGesture(false);
    }
    _wc.loadFlutterAsset('assets/game/index.html');
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state != AppLifecycleState.resumed && _ready && _result == null) {
      _setPaused(true);
    }
  }

  void _js(String code) {
    _wc.runJavaScript(code);
  }

  void _pushSettings() {
    _js('Game.settings(${jsonEncode({
          'volume': settings.volume,
          'sens': settings.sensitivity,
          'quality': settings.quality,
        })})');
  }

  void _onMessage(JavaScriptMessage m) {
    Map<String, dynamic> d;
    try {
      d = jsonDecode(m.message) as Map<String, dynamic>;
    } catch (_) {
      return;
    }
    if (!mounted) return;
    final type = d['type'];
    if (type == 'ready') {
      _pushSettings();
      _js('Game.selectAbility($_sel)');
      _js('Game.start(${widget.difficulty})');
      setState(() => _ready = true);
    } else if (type == 'state') {
      setState(() {
        _hp = (d['hp'] as num).toDouble();
        _ehp = (d['ehp'] as num).toDouble();
        _cd = (d['cd'] as num).toDouble();
      });
    } else if (type == 'over') {
      final win = d['win'] == true;
      if (win) settings.addWin();
      setState(() => _result = win ? 'win' : 'lose');
    } else if (type == 'error') {
      setState(() => _error = '${d['msg']}');
    }
  }

  void _setPaused(bool v) {
    setState(() => _paused = v);
    _js('Game.pause($v)');
  }

  void _restart() {
    setState(() {
      _result = null;
      _paused = false;
      _hp = 100;
      _ehp = 100;
      _cd = 0;
    });
    _js('Game.input(0,0)');
    _js('Game.start(${widget.difficulty})');
  }

  void _onStick(double x, double y) {
    final rx = (x * 100).round();
    final ry = (y * 100).round();
    if (rx == _lastX && ry == _lastY) return;
    _lastX = rx;
    _lastY = ry;
    _js('Game.input(${rx / 100},${ry / 100})');
  }

  void _menu() => Navigator.of(context).popUntil((r) => r.isFirst);

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop && _ready && _result == null) _setPaused(!_paused);
        if (!didPop && !_ready) _menu();
      },
      child: Scaffold(
        backgroundColor: Colors.black,
        body: Stack(
          children: [
            Positioned.fill(
              child: IgnorePointer(child: WebViewWidget(controller: _wc)),
            ),
            if (_ready && _result == null) SafeArea(child: _hud()),
            if (!_ready || _error != null) _loading(),
            if (_paused && _result == null) _pauseOverlay(),
            if (_result != null) _resultOverlay(),
          ],
        ),
      ),
    );
  }

  Widget _bar(double v, Color c, String label, {bool reversed = false}) {
    final bar = ClipRRect(
      borderRadius: BorderRadius.circular(8),
      child: LinearProgressIndicator(
        value: (v / 100).clamp(0.0, 1.0),
        minHeight: 14,
        backgroundColor: Colors.white12,
        valueColor: AlwaysStoppedAnimation<Color>(c),
      ),
    );
    return Column(
      crossAxisAlignment:
          reversed ? CrossAxisAlignment.end : CrossAxisAlignment.start,
      children: [
        Text(label,
            style: TextStyle(
                color: c,
                fontSize: 11,
                fontWeight: FontWeight.w800,
                letterSpacing: 2)),
        const SizedBox(height: 2),
        reversed
            ? Transform(
                alignment: Alignment.center,
                transform: Matrix4.diagonal3Values(-1, 1, 1),
                child: bar)
            : bar,
      ],
    );
  }

  Widget _hud() {
    return Stack(
      children: [
        Positioned(
          left: 12,
          right: 12,
          top: 8,
          child: Row(
            children: [
              Expanded(child: _bar(_hp, kCyan, 'YOU')),
              SizedBox(
                width: 110,
                child: ListenableBuilder(
                  listenable: settings,
                  builder: (_, __) => Text(
                    'WINS ${settings.wins}',
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w900,
                        letterSpacing: 2),
                  ),
                ),
              ),
              Expanded(
                  child: _bar(_ehp, const Color(0xFFFF4D8D), 'ENEMY',
                      reversed: true)),
              const SizedBox(width: 6),
              GestureDetector(
                onTap: () => _setPaused(true),
                child: const Icon(Icons.pause_circle_outline,
                    color: Colors.white70, size: 34),
              ),
            ],
          ),
        ),
        Positioned(
          left: 22,
          bottom: 18,
          child: Joystick(size: 150, onChanged: _onStick),
        ),
        Positioned(
          right: 22,
          bottom: 18,
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  GestureDetector(
                    onTap: () {
                      setState(() => _sel = (_sel + 1) % kAbilityNames.length);
                      _js('Game.selectAbility($_sel)');
                    },
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 10, vertical: 5),
                      decoration: BoxDecoration(
                        color: Colors.black54,
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: kViolet),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(Icons.swap_horiz,
                              color: kViolet, size: 16),
                          const SizedBox(width: 4),
                          Text(kAbilityNames[_sel],
                              style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 11,
                                  fontWeight: FontWeight.w800)),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 8),
                  _ActionButton(
                    size: 76,
                    icon: kAbilityIcons[_sel],
                    color: kViolet,
                    cooldown: _cd,
                    onDown: () => _js('Game.ability()'),
                  ),
                ],
              ),
              const SizedBox(width: 18),
              _ActionButton(
                size: 98,
                icon: Icons.flare,
                color: kCyan,
                label: 'KNIFE',
                onDown: () => _js('Game.throwKnife()'),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _loading() {
    return Container(
      color: kBg,
      alignment: Alignment.center,
      child: _error == null
          ? const Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                CircularProgressIndicator(color: kCyan),
                SizedBox(height: 14),
                Text('LOADING ARENA...',
                    style: TextStyle(color: Colors.white70, letterSpacing: 3)),
              ],
            )
          : Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text('3D engine error',
                    style: TextStyle(color: Colors.redAccent, fontSize: 20)),
                const SizedBox(height: 6),
                Text(_error!, style: const TextStyle(color: Colors.white70)),
                const SizedBox(height: 14),
                NeonButton(label: 'BACK', onTap: _menu, width: 160),
              ],
            ),
    );
  }

  Widget _panel(String title, Color color, List<Widget> children,
      {String? subtitle}) {
    return Container(
      color: Colors.black.withAlpha(185),
      alignment: Alignment.center,
      child: FittedBox(
        fit: BoxFit.scaleDown,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(title,
                style: TextStyle(
                    color: color,
                    fontSize: 46,
                    fontWeight: FontWeight.w900,
                    letterSpacing: 6,
                    shadows: [Shadow(color: color, blurRadius: 20)])),
            if (subtitle != null)
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Text(subtitle,
                    style: const TextStyle(
                        color: Colors.white70,
                        fontSize: 16,
                        letterSpacing: 3)),
              ),
            const SizedBox(height: 16),
            ...children,
          ],
        ),
      ),
    );
  }

  Widget _pauseOverlay() {
    return _panel('PAUSED', kCyan, [
      NeonButton(label: 'RESUME', onTap: () => _setPaused(false)),
      const SizedBox(height: 10),
      NeonButton(label: 'RESTART', color: kViolet, onTap: _restart),
      const SizedBox(height: 10),
      NeonButton(
        label: 'SETTINGS',
        color: kViolet,
        onTap: () => showSettingsDialog(context, onChanged: _pushSettings),
      ),
      const SizedBox(height: 10),
      NeonButton(label: 'MENU', color: Colors.white54, onTap: _menu),
    ]);
  }

  Widget _resultOverlay() {
    final win = _result == 'win';
    return _panel(
      win ? 'VICTORY' : 'DEFEAT',
      win ? kCyan : const Color(0xFFFF4D8D),
      [
        NeonButton(label: 'REPLAY', onTap: _restart),
        const SizedBox(height: 10),
        NeonButton(label: 'MENU', color: kViolet, onTap: _menu),
      ],
      subtitle: 'TOTAL WINS: ${settings.wins}',
    );
  }
}

class _ActionButton extends StatelessWidget {
  const _ActionButton({
    required this.size,
    required this.icon,
    required this.color,
    required this.onDown,
    this.label,
    this.cooldown = 0,
  });

  final double size;
  final IconData icon;
  final Color color;
  final VoidCallback onDown;
  final String? label;
  final double cooldown;

  @override
  Widget build(BuildContext context) {
    final cooling = cooldown > 0.05;
    return Listener(
      behavior: HitTestBehavior.opaque,
      onPointerDown: (_) => onDown(),
      child: SizedBox(
        width: size,
        height: size,
        child: Stack(
          alignment: Alignment.center,
          children: [
            Container(
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: color.withAlpha(cooling ? 40 : 90),
                border: Border.all(color: color, width: 3),
                boxShadow: [
                  BoxShadow(color: color.withAlpha(cooling ? 20 : 110), blurRadius: 14)
                ],
              ),
            ),
            if (cooling)
              SizedBox(
                width: size - 6,
                height: size - 6,
                child: CircularProgressIndicator(
                  value: 1 - (cooldown / 10).clamp(0.0, 1.0),
                  strokeWidth: 4,
                  color: Colors.white70,
                  backgroundColor: Colors.transparent,
                ),
              ),
            cooling
                ? Text(cooldown.ceil().toString(),
                    style: const TextStyle(
                        color: Colors.white,
                        fontSize: 24,
                        fontWeight: FontWeight.w900))
                : Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(icon, color: Colors.white, size: size * 0.4),
                      if (label != null)
                        Text(label!,
                            style: const TextStyle(
                                color: Colors.white,
                                fontSize: 11,
                                fontWeight: FontWeight.w900,
                                letterSpacing: 1)),
                    ],
                  ),
          ],
        ),
      ),
    );
  }
}

/// Virtual joystick. Reports x (right = +) and y (up = +) in [-1, 1].
class Joystick extends StatefulWidget {
  const Joystick({super.key, required this.size, required this.onChanged});

  final double size;
  final void Function(double x, double y) onChanged;

  @override
  State<Joystick> createState() => _JoystickState();
}

class _JoystickState extends State<Joystick> {
  Offset _knob = Offset.zero;
  int? _pid;

  double get _maxR => widget.size / 2 - 28;

  void _update(Offset local) {
    final c = Offset(widget.size / 2, widget.size / 2);
    var d = local - c;
    if (d.distance > _maxR) d = d / d.distance * _maxR;
    setState(() => _knob = d);
    widget.onChanged(d.dx / _maxR, -d.dy / _maxR);
  }

  void _reset() {
    _pid = null;
    setState(() => _knob = Offset.zero);
    widget.onChanged(0, 0);
  }

  @override
  Widget build(BuildContext context) {
    final s = widget.size;
    return Listener(
      behavior: HitTestBehavior.opaque,
      onPointerDown: (e) {
        _pid ??= e.pointer;
        if (_pid == e.pointer) _update(e.localPosition);
      },
      onPointerMove: (e) {
        if (_pid == e.pointer) _update(e.localPosition);
      },
      onPointerUp: (e) {
        if (_pid == e.pointer) _reset();
      },
      onPointerCancel: (e) {
        if (_pid == e.pointer) _reset();
      },
      child: SizedBox(
        width: s,
        height: s,
        child: Stack(
          alignment: Alignment.center,
          children: [
            Container(
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: Colors.white.withAlpha(14),
                border: Border.all(color: kCyan.withAlpha(150), width: 2),
              ),
            ),
            Transform.translate(
              offset: _knob,
              child: Container(
                width: 58,
                height: 58,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: kCyan.withAlpha(110),
                  border: Border.all(color: kCyan, width: 2),
                  boxShadow: [BoxShadow(color: kCyan.withAlpha(90), blurRadius: 12)],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
