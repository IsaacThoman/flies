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
  var window: UIWindow?
  private var game: GameViewController?

  func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options: UIScene.ConnectionOptions) {
    guard let scene = scene as? UIWindowScene else { return }
    let game = GameViewController()
    let window = UIWindow(windowScene: scene)
    window.rootViewController = game
    window.makeKeyAndVisible()
    self.window = window
    self.game = game
  }

  func sceneDidBecomeActive(_ scene: UIScene) { game?.frontmost = true }
  func sceneWillResignActive(_ scene: UIScene) { game?.frontmost = false }
}
