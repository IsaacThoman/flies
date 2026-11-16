import UIKit
import WebKit

/// For checks and measurements (`-FlyReport <seconds>` on the command line, as `npm run ios:check`
/// launches it; off from the home screen). That often it reports the canvas's state, how fast the
/// brain runs against real time and what that costs it, frames, taps and keys the page saw, what
/// the browser's cache holds of the brain, where the menu's first row is, and the app's own
/// memory, power and thermal state, as `report {json}` on the console and in
/// `Library/Caches/report.log`, and as the value of an accessibility element, `fly-report`, where
/// a UI test can read it. The page's errors and console warnings are passed on as they happen.
/// `-FlySettings <json>` changes the game's settings through its own code once it has started, as
/// its Settings screen would, for a check to see them kept across a relaunch.
@MainActor
final class Report {
  static let identifier = "fly-report"

  private weak var webView: WKWebView?
  private let started = Date()
  private var timer: Timer?
  private let element = UIView(frame: CGRect(x: 0, y: 0, width: 1, height: 1))

  static func fromLaunchArguments(webView: WKWebView, configuration: WKWebViewConfiguration) -> Report? {
    let every = UserDefaults.standard.double(forKey: "FlyReport")
    guard every > 0 else { return nil }
    return Report(webView: webView, configuration: configuration, every: every)
  }

  private init(webView: WKWebView, configuration: WKWebViewConfiguration, every: TimeInterval) {
    self.webView = webView
    configuration.userContentController.addUserScript(WKUserScript(source: Self.counters, injectionTime: .atDocumentStart, forMainFrameOnly: true))
    // From the arguments as they are: the defaults would read JSON as an old-style property list.
    let arguments = ProcessInfo.processInfo.arguments
    if let at = arguments.firstIndex(of: "-FlySettings"), at + 1 < arguments.count {
      let settings = arguments[at + 1]
      configuration.userContentController.addUserScript(WKUserScript(source: Self.change(settings), injectionTime: .atDocumentStart, forMainFrameOnly: true))
    }
    // Accessibility leaves out hidden and fully transparent views; this one is neither, and too faint and small to see.
    element.alpha = 0.02
    element.isUserInteractionEnabled = false
    element.isAccessibilityElement = true
    element.accessibilityIdentifier = Self.identifier
    timer = Timer.scheduledTimer(withTimeInterval: every, repeats: true) { [weak self] _ in
      MainActor.assumeIsolated { self?.sample() }
    }
  }

  /// Puts the accessibility element in the window, over everything else.
  func attach(to view: UIView) {
    view.addSubview(element)
  }

  func log(_ line: String) {
    write("host: \(line) at \(Int(Date().timeIntervalSince(started) * 1000)) ms")
  }

  func received(_ body: [String: Any]) {
    if let console = body["console"] as? String { write("page: \(console)") }
  }

  /// To the console, and to `Library/Caches/report.log` (replaced each launch) for runs with no console attached.
  private func write(_ line: String) {
    print(line)
    file?.write(Data((line + "\n").utf8))
  }

  private let file: FileHandle? = {
    let url = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("report.log")
    FileManager.default.createFile(atPath: url.path, contents: nil)
    return try? FileHandle(forWritingTo: url)
  }()

  private func sample() {
    guard let webView else { return }
    webView.evaluateJavaScript(Self.read) { [weak self] result, error in
      MainActor.assumeIsolated {
        guard let self else { return }
        // Nothing yet while the page is still loading.
        guard let page = result as? String else {
          if let error { self.log("report failed: \(error)") }
          return
        }
        let battery = UIDevice.current.batteryState
        let host: [String: Any] = [
          "atMs": Int(Date().timeIntervalSince(self.started) * 1000),
          "memoryMB": Self.footprintMB(),
          "thermalState": ProcessInfo.processInfo.thermalState.rawValue,
          "lowPower": ProcessInfo.processInfo.isLowPowerModeEnabled,
          "charging": battery == .charging || battery == .full,
          "idleTimerDisabled": UIApplication.shared.isIdleTimerDisabled,
          "state": UIApplication.shared.applicationState.rawValue,
          "safeArea": [self.element.superview?.safeAreaInsets.top ?? 0, self.element.superview?.safeAreaInsets.bottom ?? 0],
        ]
        let json = String(data: try! JSONSerialization.data(withJSONObject: host, options: [.sortedKeys]), encoding: .utf8)!
        let line = "{\"host\":\(json),\"page\":\(page)}"
        self.element.accessibilityValue = line
        self.write("report \(line)")
      }
    }
  }

  /// The app's own footprint, as the system counts it against its memory limit. The page runs in
  /// WebKit's processes, which are counted separately.
  private static func footprintMB() -> Double {
    var info = task_vm_info_data_t()
    var count = mach_msg_type_number_t(MemoryLayout<task_vm_info_data_t>.size / MemoryLayout<natural_t>.size)
    let result = withUnsafeMutablePointer(to: &info) {
      $0.withMemoryRebound(to: integer_t.self, capacity: Int(count)) { task_info(mach_task_self_, task_flavor_t(TASK_VM_INFO), $0, &count) }
    }
    return result == KERN_SUCCESS ? (Double(info.phys_footprint) / 1_048_576 * 10).rounded() / 10 : -1
  }

  private static let counters = """
  globalThis.__hostReport = { frames: 0, pointers: 0, keys: 0, brainWallMs: 0, brainSimMs: 0, brainAt: 0 };
  // Each new state's own cost: the brain's wall time per simulated time is its load on a core.
  const frame = () => {
    const r = __hostReport;
    r.frames++;
    const brain = globalThis.__fly?.life?.brain;
    if (brain?.state && brain.stateAt !== r.brainAt) {
      r.brainAt = brain.stateAt;
      r.brainWallMs += brain.state.stats.wallMs;
      r.brainSimMs += brain.state.stats.simMs;
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  // What the browser's cache holds for the brain (apps/web/src/brain/download.ts), for a check that nothing is copied there.
  const cached = () => {
    if (typeof caches === "undefined") return void (__hostReport.cached = null);
    Promise.all(["fly-brain", "fly-brain-module"].map((name) => caches.open(name).then((cache) => cache.keys()))).then(
      (kept) => (__hostReport.cached = kept.reduce((n, keys) => n + keys.length, 0)),
      () => (__hostReport.cached = -1),
    );
  };
  setInterval(cached, 1000);
  addEventListener("pointerdown", () => __hostReport.pointers++, true);
  addEventListener("keydown", () => __hostReport.keys++, true);
  const tell = (line) => webkit.messageHandlers.\(PageScripts.channel).postMessage({ console: line });
  addEventListener("error", (e) => tell(`error: ${e.message} (${e.filename}:${e.lineno})`));
  addEventListener("unhandledrejection", (e) => tell(`unhandled rejection: ${e.reason}`));
  for (const level of ["warn", "error"]) {
    const original = console[level];
    console[level] = (...args) => { tell(`${level}: ${args.join(" ")}`); original.apply(console, args); };
  }
  """

  private static func change(_ settings: String) -> String {
    """
    const change = () => {
      const fly = globalThis.__fly;
      if (!fly) return requestAnimationFrame(change);
      Object.assign(fly.settings, \(settings));
      fly.applySettings();
    };
    requestAnimationFrame(change);
    """
  }

  private static let read = """
  (() => {
    // Where the first row of the menu showing is, 0 to 1 across and down (the canvas fills the page), for a UI test to tap.
    const firstRow = (fly) => {
      const hits = fly?.overlay?.hits, design = fly?.shape?.design;
      for (let i = (hits?.count ?? 0) - 1; i >= 0; i--) {
        const h = hits.get(i);
        if (h.kind === "row" && h.index === 0) return [(h.x + h.w / 2) / design.width, (h.y + h.h / 2) / design.height];
      }
      return null;
    };
    const canvas = document.getElementById("game");
    const fly = globalThis.__fly;
    const r = globalThis.__hostReport;
    if (!r) return null;
    return JSON.stringify({
      dataset: canvas ? { ...canvas.dataset } : null,
      speed: fly?.meter?.speed ?? null,
      frames: r.frames,
      pointers: r.pointers,
      keys: r.keys,
      brainWallMs: Math.round(r.brainWallMs),
      brainSimMs: Math.round(r.brainSimMs),
      brainKept: fly?.life?.brain?.source?.kept ?? null,
      cached: r.cached ?? null,
      digest: !!globalThis.crypto?.subtle,
      firstRow: firstRow(fly),
      visibility: document.visibilityState,
      safeArea: globalThis.\(PageScripts.safeAreaProperty) ?? null,
      size: [innerWidth, innerHeight, devicePixelRatio],
    });
  })()
  """
}
