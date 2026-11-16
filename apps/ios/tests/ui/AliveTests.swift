import XCTest

/// The fly is alive in the app: the brain is read from the app's bundle, runs as WebAssembly, wakes and keeps time, and
/// nothing of it is copied into the browser's cache, then or on a relaunch; frames are drawn; a tap
/// on the title's first row starts play; it stops in the background and carries on in front; and a
/// setting changed in one run is still there in the next after the app is killed. Run by `npm run ios:check`
/// (apps/ios/tests/simulator.ios.ts), which reads the `check:` lines this prints.
///
/// The game's state comes from the app's report (Reports.swift).
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
    var state = try app.wait("the brain to wake and the title to show", timeout: 180) { $0.data("brain") == "running" && $0.data("screen") == "title" }
    let awake = Date().timeIntervalSince(launched)
    let first = state

    // A loaded simulator may draw slowly; liveness is progress in both clocks, not a frame rate.
    state = try app.wait("frames and the brain to advance", timeout: 60) {
      $0.frames > first.frames + 40 && $0.brainSimMs > first.brainSimMs + 1000
    }
    let drawn = state.frames - first.frames
    let elapsed = (state.atMs - first.atMs) / 1000
    let load = state.brainSimMs > 0 ? state.brainWallMs / state.brainSimMs : 0
    try assertBrainFromBundle(state)

    // A tap on the title's first row (Visit the fly) reaches the game and starts play.
    try app.tapFirstRow(state)
    try app.wait("play, from a tap") { $0.data("screen") == "play" && $0.pointers >= 1 }

    // A hardware keyboard reaches the game, if the simulator has one: a simulator shown in
    // Simulator (or T3 Code's device panel) does; a headless one, as this check makes, doesn't.
    let before = try app.report().keys
    app.typeKey(XCUIKeyboardKey.downArrow.rawValue, modifierFlags: [])
    let keyboard = (try? app.wait("a key", timeout: 3) { $0.keys > before }) != nil

    // Away (another app over the whole screen) for 6 s the brain doesn't run; in front again it
    // carries on. It lives on while it can still be seen as the other app slides in and out, so
    // what is held to account is how much of the time away passed with it stopped.
    let away = try app.report()
    XCUIApplication(bundleIdentifier: "com.apple.Preferences").activate()
    sleep(6)
    XCTAssertNotEqual(app.state, .runningForeground, "in the background")
    app.activate()
    let back = try app.wait("in front again") { $0.visible && $0.frames > away.frames }
    let stopped = (back.atMs - away.atMs) - (back.brainSimMs - away.brainSimMs)
    XCTAssertGreaterThan(stopped, 4000, "ms of the time away with the brain stopped")
    try app.wait("the brain carrying on", timeout: 60) { $0.frames > back.frames + 60 && $0.brainSimMs > back.brainSimMs + 1000 }

    // A setting changed through the game's own settings, then the app killed as the app switcher
    // does: the next launch has it.
    app.terminate()
    app.launchArguments = reporting + ["-FlySettings", #"{"eyes":"off"}"#]
    app.launch()
    try app.wait("the eyes turned off", timeout: 180) { $0.data("brain") == "running" && $0.data("eyes") == "off" }
    app.terminate()
    app.launchArguments = reporting
    app.launch()
    let relaunched = try app.wait("the setting kept across a relaunch", timeout: 180) { $0.data("brain") == "running" && $0.data("eyes") == "off" }
    try assertBrainFromBundle(relaunched)

    print("check: {\"awakeS\":\(awake),\"fps\":\(Double(drawn) / elapsed),\"speed\":\(state.speed),\"brainLoad\":\(load),\"spikesPerSecond\":\(state.data("spikesPerSecond") ?? "0"),\"frameMs\":\(state.data("frameMs") ?? "0"),\"quality\":\(state.data("quality") ?? "0"),\"engine\":\"\(state.data("brainEngine") ?? "")\",\"keyboard\":\(keyboard)}")
    if let path = ProcessInfo.processInfo.environment["FLY_SCREENSHOT"] {
      try XCUIScreen.main.screenshot().pngRepresentation.write(to: URL(fileURLWithPath: path))
    }
  }

  /// The brain came through the app's URL scheme from its bundle ("network" to the page: fetched,
  /// not from the browser's cache), and the cache, which can't keep that scheme's responses, holds
  /// none of it.
  private func assertBrainFromBundle(_ state: Report) throws {
    XCTAssertEqual(state.data("from"), "network", "the brain fetched from the bundle")
    XCTAssertEqual(state.data("brainEngine"), "wasm", "the brain built as WebAssembly (iOS 18.4 and later)")
    XCTAssertTrue(state.cached == nil || state.cached == 0, "nothing of the brain in the browser's cache: \(String(describing: state.cached))")
  }
}
