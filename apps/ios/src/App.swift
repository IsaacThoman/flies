import UIKit

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
  func application(_ application: UIApplication, configurationForConnecting session: UISceneSession, options: UIScene.ConnectionOptions) -> UISceneConfiguration {
    let configuration = UISceneConfiguration(name: nil, sessionRole: session.role)
    configuration.delegateClass = SceneDelegate.self
    return configuration
  }
}

/// One window, one fly: a second window would be a second brain.
final class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  /// What a check posts (a Darwin notification, which reaches the app from the UI test's process) to
  /// hand the running app its `-FlyInviteLater` link.
  static let inviteNow = "com.isaacthoman.flies.invite-now"

  var window: UIWindow?
  private var game: GameViewController?

  func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options: UIScene.ConnectionOptions) {
    guard let scene = scene as? UIWindowScene else { return }
    // Opened by a table's link (a universal link): the game starts at that table. `-FlyInvite <link>`
    // stands in for one in checks, through the same test of the link.
    let opened = options.userActivities.filter { $0.activityType == NSUserActivityTypeBrowsingWeb }.compactMap(\.webpageURL)
    let links = opened + [ProcessInfo.processInfo.argument(after: "-FlyInvite").flatMap(URL.init(string:))].compactMap { $0 }
    let game = GameViewController(table: links.lazy.compactMap(Links.table).first)
    let window = UIWindow(windowScene: scene)
    window.rootViewController = game
    window.makeKeyAndVisible()
    self.window = window
    self.game = game
    game.visible = scene.activationState != .background
    inviteLater()
  }

  /// A table's link opened while the app runs (a universal link): the game sits down there.
  func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
    guard userActivity.activityType == NSUserActivityTypeBrowsingWeb, let table = userActivity.webpageURL.flatMap(Links.table) else { return }
    game?.invite(to: table)
  }

  // Seen, or not: a scene in the foreground is on screen, focused or not (an iPad's window beside
  // another app's, or under Control Center); iOS moves it to the background when nothing of it
  // can be seen (the home screen, another app over the whole screen, the lock screen).
  func sceneWillEnterForeground(_ scene: UIScene) { game?.visible = true }
  func sceneDidEnterBackground(_ scene: UIScene) { game?.visible = false }

  /// For checks, a link that reaches the running app: `-FlyInviteLater <link>` hands it over as iOS
  /// hands over a universal link, through `scene(_:continue:)`, when the check posts `inviteNow`.
  /// XCUITest can't do it itself: its `open(_:)` starts the app afresh with the link.
  private func inviteLater() {
    guard ProcessInfo.processInfo.argument(after: "-FlyInviteLater") != nil else { return }
    CFNotificationCenterAddObserver(CFNotificationCenterGetDarwinNotifyCenter(), nil, { _, _, _, _, _ in
      DispatchQueue.main.async {
        MainActor.assumeIsolated {
          guard let link = ProcessInfo.processInfo.argument(after: "-FlyInviteLater").flatMap(URL.init(string:)),
                let scene = UIApplication.shared.connectedScenes.first, let delegate = scene.delegate as? SceneDelegate else { return }
          let activity = NSUserActivity(activityType: NSUserActivityTypeBrowsingWeb)
          activity.webpageURL = link
          delegate.scene(scene, continue: activity)
        }
      }
    }, Self.inviteNow as CFString, nil, .deliverImmediately)
  }
}
