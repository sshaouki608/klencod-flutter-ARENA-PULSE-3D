import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'common.dart';
import 'game_page.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await SystemChrome.setPreferredOrientations(const [
    DeviceOrientation.landscapeLeft,
    DeviceOrientation.landscapeRight,
  ]);
  await SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
  await settings.load();
  runApp(const ArenaApp());
}

class ArenaApp extends StatelessWidget {
  const ArenaApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'ARENA PULSE 3D',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        brightness: Brightness.dark,
        scaffoldBackgroundColor: kBg,
        colorScheme: const ColorScheme.dark(primary: kCyan, secondary: kViolet),
        useMaterial3: true,
      ),
      home: const StartScreen(),
    );
  }
}

BoxDecoration _bg() => const BoxDecoration(
      gradient: RadialGradient(
        center: Alignment(0, -0.3),
        radius: 1.2,
        colors: [Color(0xFF241347), kBg],
      ),
    );

class StartScreen extends StatelessWidget {
  const StartScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        decoration: _bg(),
        child: Center(
          child: FittedBox(
            fit: BoxFit.scaleDown,
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Text(
                    'ARENA PULSE',
                    style: TextStyle(
                      fontSize: 54,
                      fontWeight: FontWeight.w900,
                      letterSpacing: 6,
                      color: Colors.white,
                      shadows: [
                        Shadow(color: kCyan, blurRadius: 22),
                        Shadow(color: kViolet, blurRadius: 40),
                      ],
                    ),
                  ),
                  const Text(
                    '3D',
                    style: TextStyle(
                      fontSize: 34,
                      fontWeight: FontWeight.w900,
                      letterSpacing: 12,
                      color: kCyan,
                      shadows: [Shadow(color: kCyan, blurRadius: 18)],
                    ),
                  ),
                  const SizedBox(height: 8),
                  ListenableBuilder(
                    listenable: settings,
                    builder: (_, __) => Text(
                      'WINS: ${settings.wins}',
                      style: const TextStyle(
                          color: kViolet,
                          fontSize: 16,
                          fontWeight: FontWeight.w700,
                          letterSpacing: 3),
                    ),
                  ),
                  const SizedBox(height: 18),
                  NeonButton(
                    label: 'PLAY',
                    onTap: () => Navigator.of(context).push(
                      MaterialPageRoute<void>(
                          builder: (_) => const ModeScreen()),
                    ),
                  ),
                  const SizedBox(height: 12),
                  NeonButton(
                    label: 'SETTINGS',
                    color: kViolet,
                    onTap: () => showSettingsDialog(context),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class ModeScreen extends StatelessWidget {
  const ModeScreen({super.key});

  static const _modes = [
    ('ROOKIE', 'Slow, inaccurate rival.\nGood for learning.', kCyan),
    ('DUELIST', 'Balanced rival.\nDodges and dashes.', kViolet),
    ('PULSE MASTER', 'Fast, accurate rival.\nUses shield and pulse.', Color(0xFFFF4D8D)),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        decoration: _bg(),
        child: SafeArea(
          child: Stack(
            children: [
              Positioned(
                left: 8,
                top: 8,
                child: IconButton(
                  icon: const Icon(Icons.arrow_back, color: Colors.white),
                  onPressed: () => Navigator.of(context).pop(),
                ),
              ),
              Center(
                child: FittedBox(
                  fit: BoxFit.scaleDown,
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Text('SELECT MODE',
                          style: TextStyle(
                              color: kCyan,
                              fontSize: 26,
                              fontWeight: FontWeight.w900,
                              letterSpacing: 4)),
                      const SizedBox(height: 14),
                      Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          for (int i = 0; i < _modes.length; i++)
                            Padding(
                              padding: const EdgeInsets.all(8),
                              child: GestureDetector(
                                onTap: () => Navigator.of(context)
                                    .pushReplacement(MaterialPageRoute<void>(
                                  builder: (_) => GamePage(difficulty: i),
                                )),
                                child: Container(
                                  width: 200,
                                  height: 150,
                                  padding: const EdgeInsets.all(14),
                                  decoration: BoxDecoration(
                                    borderRadius: BorderRadius.circular(16),
                                    border:
                                        Border.all(color: _modes[i].$3, width: 2),
                                    color: _modes[i].$3.withAlpha(30),
                                    boxShadow: [
                                      BoxShadow(
                                          color: _modes[i].$3.withAlpha(70),
                                          blurRadius: 14)
                                    ],
                                  ),
                                  child: Column(
                                    mainAxisAlignment: MainAxisAlignment.center,
                                    children: [
                                      Text(_modes[i].$1,
                                          style: const TextStyle(
                                              color: Colors.white,
                                              fontSize: 19,
                                              fontWeight: FontWeight.w900,
                                              letterSpacing: 1.5)),
                                      const SizedBox(height: 10),
                                      Text(_modes[i].$2,
                                          textAlign: TextAlign.center,
                                          style: const TextStyle(
                                              color: Colors.white70,
                                              fontSize: 13)),
                                    ],
                                  ),
                                ),
                              ),
                            ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}