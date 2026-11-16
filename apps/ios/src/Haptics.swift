import UIKit

/// What the player feels through the glass while they play: the fly's own touch while the feather
/// is on it, and a knock when it takes off. Both come from the fly's state as the game publishes it
/// (its `touch` sense and its count of take-offs), so they are what happened to the fly and nothing
/// else; never in the wallpaper, where nobody's finger is on the screen. Off with the Haptics
/// switch in the app's page of the Settings app, or with the system's own.
@MainActor
final class Haptics {
  /// The feather resting on the fly is 0.4 of its touch sense and stroking it 1; a raindrop or a
  /// bubble bursting on it is less, and isn't the player's doing.
  static let featherTouch = 0.35

  private let feather = UIImpactFeedbackGenerator(style: .soft)
  private let leap = UIImpactFeedbackGenerator(style: .rigid)
  private var takeoffs: Int?

  private var enabled: Bool { UserDefaults.standard.object(forKey: "haptics") as? Bool ?? true }

  /// The game's state, each time it changes (at most every 200 ms).
  func update(screen: String?, wallpaper: Bool, tool: String?, touch: Double, takeoffs: Int) {
    defer { self.takeoffs = takeoffs }
    guard enabled, screen == "play", !wallpaper else { return }
    if let before = self.takeoffs, takeoffs > before { leap.impactOccurred() }
    if tool == "tickle", touch > Self.featherTouch { feather.impactOccurred(intensity: min(1, touch)) }
  }
}
