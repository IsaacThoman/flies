import XCTest

@testable import AppleTVFly

/// What the player feels for each change of the game's state (Haptics.feel).
@MainActor
final class HapticsTests: XCTestCase {
  private func feel(screen: String = "play", wallpaper: Bool = false, tool: String = "feed", touch: Double = 0, takeoffs: Int = 0, before: Int? = 0) -> Haptics.Feel {
    Haptics.feel(screen: screen, wallpaper: wallpaper, tool: tool, touch: touch, takeoffs: takeoffs, before: before)
  }

  func testATakeOffKnocks() {
    XCTAssertTrue(feel(takeoffs: 3, before: 2).leap)
    XCTAssertFalse(feel(takeoffs: 2, before: 2).leap)
    XCTAssertFalse(feel(takeoffs: 2, before: nil).leap, "the count the game starts with is no take-off")
  }

  func testTheFeatherOnTheFlyTapsAsFirmlyAsItIsFelt() {
    XCTAssertEqual(feel(tool: "feather", touch: 0.4).feather, 0.4, "resting on it")
    XCTAssertEqual(feel(tool: "feather", touch: 1).feather, 1, "stroking it")
    XCTAssertNil(feel(tool: "feather", touch: 0.25).feather, "a raindrop while the feather is in hand")
    XCTAssertNil(feel(tool: "blow", touch: 0.4).feather, "a leaf brushing it, with another tool")
  }

  func testNothingOutsidePlay() {
    XCTAssertEqual(feel(wallpaper: true, tool: "feather", touch: 1, takeoffs: 3, before: 2), Haptics.Feel())
    XCTAssertEqual(feel(screen: "title", tool: "feather", touch: 1, takeoffs: 3, before: 2), Haptics.Feel())
  }
}
