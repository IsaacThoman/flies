import UIKit

/// What the player feels through the glass while they play: the fly's own touch while the feather
/// is on it, and a knock when it takes off. Both come from the fly's state as the game publishes it
/// (its `touch` sense, the tool in hand and its count of take-offs), so they are what happened to
/// the fly and nothing else; never in the wallpaper, where nobody's finger is on the screen. Off
/// with the Haptics switch in the app's page of the Settings app, or with the system's own.
@MainActor
final class Haptics {
  /// What to play for one change of the game's state.
  struct Feel: Equatable {
    var leap = false
    /// How firmly the feather taps, 0 to 1, or nil for not at all.
    var feather: Double?
  }

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
    guard enabled else { return }
    let feel = Self.feel(screen: screen, wallpaper: wallpaper, tool: tool, touch: touch, takeoffs: takeoffs, before: self.takeoffs)
    if feel.leap { leap.impactOccurred() }
    if let firmness = feel.feather { feather.impactOccurred(intensity: firmness) }
  }

  /// `before` is the count of take-offs at the last change, nil at the first.
  static func feel(screen: String?, wallpaper: Bool, tool: String?, touch: Double, takeoffs: Int, before: Int?) -> Feel {
    guard screen == "play", !wallpaper else { return Feel() }
    return Feel(leap: before.map { takeoffs > $0 } ?? false, feather: tool == "feather" && touch > featherTouch ? min(1, touch) : nil)
  }
}
