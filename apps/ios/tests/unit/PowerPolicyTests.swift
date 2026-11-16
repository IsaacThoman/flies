import XCTest

@testable import Flies

/// When the screen is held on and when the game runs (PowerPolicy).
final class PowerPolicyTests: XCTestCase {
  private let start = Date(timeIntervalSinceReferenceDate: 1000)

  private func watching(_ edit: (inout PowerPolicy) -> Void = { _ in }) -> PowerPolicy {
    var policy = PowerPolicy(visible: true, wallpaper: true, wallpaperSince: start, charging: true)
    edit(&policy)
    return policy
  }

  func testOnAChargerTheWallpaperKeepsTheScreenOn() {
    XCTAssertEqual(watching().screenOnUntil(), .distantFuture)
    XCTAssertEqual(watching { $0.thermal = .fair }.screenOnUntil(), .distantFuture)
  }

  func testOnBatteryOnlyForAWhile() {
    XCTAssertEqual(watching { $0.charging = false }.screenOnUntil(), start.addingTimeInterval(PowerPolicy.onBattery))
  }

  func testOnlyTheWallpaperOnScreenKeepsTheScreenOn() {
    XCTAssertNil(watching { $0.wallpaper = false; $0.wallpaperSince = nil }.screenOnUntil(), "playing: the touches keep it on")
    XCTAssertNil(watching { $0.visible = false }.screenOnUntil())
  }

  func testSavingPowerOrAHotPhoneLetsTheScreenSleep() {
    XCTAssertNil(watching { $0.lowPower = true }.screenOnUntil())
    XCTAssertNil(watching { $0.thermal = .serious }.screenOnUntil())
    XCTAssertNil(watching { $0.thermal = .critical }.screenOnUntil())
  }

  func testTheGameRunsWhenSeenUnlessCriticallyHot() {
    XCTAssertTrue(watching().running)
    XCTAssertTrue(watching { $0.thermal = .serious }.running)
    XCTAssertFalse(watching { $0.thermal = .critical }.running)
    XCTAssertFalse(watching { $0.visible = false }.running)
  }
}
