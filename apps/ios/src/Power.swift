import UIKit

/// When the fly may keep the screen on, and when it must stop altogether.
///
/// The brain keeps a core busy and the world is drawn 60 times a second, so a phone that watched
/// the wallpaper for as long as it liked would go flat in a few hours and grow warm doing it. The
/// screen is held on only while the wallpaper can be seen and nothing says to save power:
/// indefinitely on a charger, for `onBattery` on battery (after which the phone locks as its own
/// auto-lock setting says), and never in Low Power Mode or once the phone is hot. The game runs
/// whenever it can be seen, focused or not, except when the phone is critically hot.
struct PowerPolicy: Equatable {
  /// The longest the wallpaper keeps the screen on, on battery, after the last touch.
  static let onBattery: TimeInterval = 10 * 60

  /// Some of the app's window is on screen (its scene is in the foreground).
  var visible = false
  var wallpaper = false
  /// When the wallpaper last began; nil while it isn't showing.
  var wallpaperSince: Date?
  var charging = false
  var lowPower = false
  var thermal = ProcessInfo.ThermalState.nominal

  /// The game runs: seen, and the phone not critically hot.
  var running: Bool { visible && thermal != .critical }

  /// Until when the screen should be kept on, or nil to let it sleep as usual.
  func screenOnUntil() -> Date? {
    guard running, wallpaper, let since = wallpaperSince, !lowPower, thermal == .nominal || thermal == .fair else { return nil }
    return charging ? .distantFuture : since.addingTimeInterval(Self.onBattery)
  }
}

/// Follows the battery, Low Power Mode and the thermal state, and applies `PowerPolicy` to the
/// idle timer. Tells its owner when the game should pause or run.
@MainActor
final class Power {
  private(set) var policy = PowerPolicy()
  var onRunningChange: ((Bool) -> Void)?
  private var release: Timer?

  init() {
    UIDevice.current.isBatteryMonitoringEnabled = true
    let center = NotificationCenter.default
    for name in [UIDevice.batteryStateDidChangeNotification, Notification.Name.NSProcessInfoPowerStateDidChange, ProcessInfo.thermalStateDidChangeNotification] {
      // Power and thermal changes are posted on whichever thread noticed them.
      center.addObserver(forName: name, object: nil, queue: .main) { [weak self] _ in
        MainActor.assumeIsolated { self?.readDevice() }
      }
    }
    readDevice()
  }

  var visible: Bool {
    get { policy.visible }
    set { change { $0.visible = newValue } }
  }

  var wallpaper: Bool {
    get { policy.wallpaper }
    set {
      change {
        if newValue && !$0.wallpaper { $0.wallpaperSince = Date() }
        if !newValue { $0.wallpaperSince = nil }
        $0.wallpaper = newValue
      }
    }
  }

  private func readDevice() {
    let info = ProcessInfo.processInfo
    let battery = UIDevice.current.batteryState
    change {
      $0.charging = battery == .charging || battery == .full
      $0.lowPower = info.isLowPowerModeEnabled
      $0.thermal = info.thermalState
    }
  }

  private func change(_ edit: (inout PowerPolicy) -> Void) {
    let was = policy
    edit(&policy)
    guard policy != was else { return }
    if policy.running != was.running { onRunningChange?(policy.running) }
    applyScreen()
  }

  private func applyScreen() {
    release?.invalidate()
    release = nil
    guard let until = policy.screenOnUntil(), until > Date() else {
      UIApplication.shared.isIdleTimerDisabled = false
      return
    }
    UIApplication.shared.isIdleTimerDisabled = true
    guard until != .distantFuture else { return }
    release = Timer.scheduledTimer(withTimeInterval: until.timeIntervalSinceNow, repeats: false) { [weak self] _ in
      MainActor.assumeIsolated { self?.applyScreen() }
    }
  }
}
