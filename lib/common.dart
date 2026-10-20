import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

const Color kBg = Color(0xFF07060F);
const Color kCyan = Color(0xFF00E5FF);
const Color kViolet = Color(0xFF9B5CFF);

/// Persistent settings + win counter (stored locally, no internet needed).
class AppSettings extends ChangeNotifier {
  double volume = 0.7;
  double sensitivity = 0.5;
  int quality = 1; // 0 = low, 1 = medium, 2 = high
  int wins = 0;
  SharedPreferences? _p;

  Future<void> load() async {
    try {
      final p = await SharedPreferences.getInstance();
      _p = p;
      volume = p.getDouble('volume') ?? 0.7;
      sensitivity = p.getDouble('sens') ?? 0.5;
      quality = p.getInt('quality') ?? 1;
      wins = p.getInt('wins') ?? 0;
    } catch (_) {
      // Fall back to defaults if storage is unavailable.
    }
  }

  void save() {
    final p = _p;
    if (p != null) {
      p.setDouble('volume', volume);
      p.setDouble('sens', sensitivity);
      p.setInt('quality', quality);
    }
    notifyListeners();
  }

  void addWin() {
    wins++;
    _p?.setInt('wins', wins);
    notifyListeners();
  }
}

final AppSettings settings = AppSettings();

class NeonButton extends StatelessWidget {
  const NeonButton({
    super.key,
    required this.label,
    required this.onTap,
    this.color = kCyan,
    this.width = 230,
  });

  final String label;
  final VoidCallback onTap;
  final Color color;
  final double width;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: width,
        padding: const EdgeInsets.symmetric(vertical: 12),
        alignment: Alignment.center,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: color, width: 2),
          gradient: LinearGradient(
            colors: [color.withAlpha(60), kViolet.withAlpha(45)],
          ),
          boxShadow: [BoxShadow(color: color.withAlpha(80), blurRadius: 14)],
        ),
        child: Text(
          label,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 18,
            fontWeight: FontWeight.w800,
            letterSpacing: 2,
          ),
        ),
      ),
    );
  }
}

Future<void> showSettingsDialog(BuildContext context,
    {VoidCallback? onChanged}) {
  const labels = ['LOW', 'MEDIUM', 'HIGH'];
  return showDialog<void>(
    context: context,
    builder: (ctx) => Dialog(
      backgroundColor: const Color(0xFF12101F),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(18),
        side: const BorderSide(color: kCyan),
      ),
      child: StatefulBuilder(
        builder: (ctx, setState) {
          void changed() {
            settings.save();
            onChanged?.call();
            setState(() {});
          }

          return SizedBox(
            width: 420,
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(18),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('SETTINGS',
                      style: TextStyle(
                          color: kCyan,
                          fontSize: 20,
                          fontWeight: FontWeight.w900,
                          letterSpacing: 3)),
                  const SizedBox(height: 10),
                  const Text('Volume', style: TextStyle(color: Colors.white)),
                  Slider(
                    value: settings.volume,
                    activeColor: kCyan,
                    onChanged: (v) {
                      settings.volume = v;
                      changed();
                    },
                  ),
                  const Text('Camera sensitivity',
                      style: TextStyle(color: Colors.white)),
                  Slider(
                    value: settings.sensitivity,
                    activeColor: kViolet,
                    onChanged: (v) {
                      settings.sensitivity = v;
                      changed();
                    },
                  ),
                  const Text('Graphics quality',
                      style: TextStyle(color: Colors.white)),
                  const SizedBox(height: 6),
                  Row(
                    children: [
                      for (int i = 0; i < labels.length; i++)
                        Padding(
                          padding: const EdgeInsets.only(right: 8),
                          child: ChoiceChip(
                            label: Text(labels[i]),
                            selected: settings.quality == i,
                            selectedColor: kCyan.withAlpha(120),
                            onSelected: (_) {
                              settings.quality = i;
                              changed();
                            },
                          ),
                        ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  Align(
                    alignment: Alignment.centerRight,
                    child: TextButton(
                      onPressed: () => Navigator.of(ctx).pop(),
                      child: const Text('CLOSE'),
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    ),
  );
}
