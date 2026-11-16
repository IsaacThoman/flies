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
    game.visible = scene.activationState != .background
  }

  // Seen, or not: a scene in the foreground is on screen, focused or not (an iPad's window beside
  // another app's, or under Control Center); iOS moves it to the background when nothing of it
  // can be seen (the home screen, another app over the whole screen, the lock screen).
  func sceneWillEnterForeground(_ scene: UIScene) { game?.visible = true }
  func sceneDidEnterBackground(_ scene: UIScene) { game?.visible = false }
}
