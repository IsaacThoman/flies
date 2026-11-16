import XCTest

/// The fly is alive in the app: the brain wakes and keeps time, frames are drawn, a tap reaches the
/// game, it stops in the background and carries on in front, and a setting changed in one run is
/// still there in the next after the app is killed. Run by `npm run ios:check`
/// (apps/ios/tests/simulator.ios.ts), which reads the `check:` lines this prints.
///
/// The game's state comes from the app's report (`-FlyReport`, src/Report.swift): the canvas's
/// `data-*` and the page's counters, as the value of the `fly-report` accessibility element.
@MainActor
final class AliveTests: XCTestCase {
  private let app = XCUIApplication()
  private let reporting = ["-FlyReport", "0.25"]

  override func setUp() {
    continueAfterFailure = false
  }

  func testTheFlyIsAlive() throws {
    app.launchArguments = reporting
    let launched = Date()
    app.launch()
    var state = try wait("the brain to wake and the title to show", timeout: 180) { $0.data("brain") == "running" && $0.data("screen") == "title" }
    let awake = Date().timeIntervalSince(launched)
    let firstFrames = state.frames

    // Frames go on being drawn and the brain keeps up with them.
    sleep(4)
    state = try report()
    let drawn = state.frames - firstFrames
    XCTAssertGreaterThan(drawn, 100, "frames drawn in 4 s")
    XCTAssertGreaterThan(state.speed, 0.8, "the brain against real time")
    let load = state.brainSimMs > 0 ? state.brainWallMs / state.brainSimMs : 0

    // A tap on the screen reaches the page, where the game reads the pointer.
    app.webViews.firstMatch.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
    try wait("the tap") { $0.pointers >= 1 }

    // A hardware keyboard reaches the game, if the simulator has one: a simulator shown in
    // Simulator (or T3 Code's device panel) does; a headless one, as this check makes, doesn't.
    let before = try report().keys
    app.typeKey(XCUIKeyboardKey.downArrow.rawValue, modifierFlags: [])
    let keyboard = (try? wait("a key", timeout: 3) { $0.keys > before }) != nil

    // Away (another app in front) for 6 s the brain doesn't run; in front again it carries on.
    let away = try report()
    XCUIApplication(bundleIdentifier: "com.apple.Preferences").activate()
    sleep(6)
    XCTAssertNotEqual(app.state, .runningForeground, "in the background")
    app.activate()
    let back = try wait("in front again") { $0.visible && $0.frames > away.frames }
    XCTAssertLessThan(back.brainSimMs - away.brainSimMs, 2500, "fly time while away for 6 s")
    let resumed = try wait("the brain carrying on") { $0.frames > back.frames + 60 && $0.brainSimMs > back.brainSimMs + 1000 }
    XCTAssertGreaterThan(resumed.speed, 0.8, "the brain against real time after coming back")

    // A setting changed through the game's own settings, then the app killed as the app switcher
    // does: the next launch has it.
    app.terminate()
    app.launchArguments = reporting + ["-FlySettings", #"{"eyes":"off"}"#]
    app.launch()
    try wait("the eyes turned off", timeout: 180) { $0.data("brain") == "running" && $0.data("eyes") == "off" }
    app.terminate()
    app.launchArguments = reporting
    app.launch()
    try wait("the setting kept across a relaunch", timeout: 180) { $0.data("brain") == "running" && $0.data("eyes") == "off" }

    print("check: {\"awakeS\":\(awake),\"fps\":\(Double(drawn) / 4),\"speed\":\(state.speed),\"brainLoad\":\(load),\"spikesPerSecond\":\(state.data("spikesPerSecond") ?? "0"),\"frameMs\":\(state.data("frameMs") ?? "0"),\"keyboard\":\(keyboard)}")
    if let path = ProcessInfo.processInfo.environment["FLY_SCREENSHOT"] {
      try XCUIScreen.main.screenshot().pngRepresentation.write(to: URL(fileURLWithPath: path))
    }
  }

  @discardableResult
  private func wait(_ what: String, timeout: TimeInterval = 20, _ done: (Report) -> Bool) throws -> Report {
    let until = Date().addingTimeInterval(timeout)
    var last: Report?
    while Date() < until {
      if let state = try? report() {
        last = state
        if done(state) { return state }
      }
      Thread.sleep(forTimeInterval: 0.25)
    }
    throw Failure("waited \(Int(timeout)) s for \(what); last report \(last?.raw ?? "none")")
  }

  private func report() throws -> Report {
    let element = app.descendants(matching: .any)["fly-report"]
    guard element.exists, let value = element.value as? String, let report = Report(value) else { throw Failure("no report") }
    return report
  }

  private struct Failure: Error, CustomStringConvertible {
    let description: String
    init(_ description: String) { self.description = description }
  }

  /// One of the app's reports.
  private struct Report {
    let raw: String
    private let page: [String: Any]

    init?(_ raw: String) {
      guard let json = try? JSONSerialization.jsonObject(with: Data(raw.utf8)) as? [String: Any], let page = json["page"] as? [String: Any] else { return nil }
      self.raw = raw
      self.page = page
    }

    func data(_ key: String) -> String? { (page["dataset"] as? [String: Any])?[key] as? String }
    var frames: Int { page["frames"] as? Int ?? 0 }
    var pointers: Int { page["pointers"] as? Int ?? 0 }
    var keys: Int { page["keys"] as? Int ?? 0 }
    var speed: Double { page["speed"] as? Double ?? 0 }
    var brainWallMs: Double { page["brainWallMs"] as? Double ?? 0 }
    var brainSimMs: Double { page["brainSimMs"] as? Double ?? 0 }
    var visible: Bool { page["visibility"] as? String == "visible" }
  }
}
