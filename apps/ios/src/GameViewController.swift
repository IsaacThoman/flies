import UIKit
import WebKit

/// The game: the web build in a web view that fills the window edge to edge, with the launch image
/// over it until the game has drawn its first screen (`data-ready`, as the Apple TV's host waits for).
///
/// While the game shouldn't run (nothing of the app can be seen, or the phone is critically hot),
/// the web view leaves the window and a still of its last frame takes its place. Out of a window
/// the page is hidden, and the game sleeps as it does in a hidden browser tab (apps/web/src/page.ts):
/// no frames, so the fly's life and the brain stop with them, and no sound. Shown again it carries
/// on from where it was. WebKit hides the page of an app in the background by itself; only the heat
/// needs this, but one way for both keeps them the same.
final class GameViewController: UIViewController, WKScriptMessageHandler, WKNavigationDelegate, UIScrollViewDelegate {
  private let webView: WKWebView
  private let schemeHandler: BundleSchemeHandler
  private let splash = UIImageView(image: UIImage(named: "Launch Image"))
  private let power = Power()
  private let haptics = Haptics()
  private var report: Report?
  private var still: UIView?
  private var shown = false

  init() {
    let www = Bundle.main.resourceURL!.appendingPathComponent("www", isDirectory: true)
    schemeHandler = BundleSchemeHandler(root: www)
    let configuration = WKWebViewConfiguration()
    configuration.setURLSchemeHandler(schemeHandler, forURLScheme: BundleSchemeHandler.scheme)
    // Sound starts when the page's own code says (the player's first press or touch, or the game
    // waking), without WebKit asking for a gesture of its own.
    configuration.mediaTypesRequiringUserActionForPlayback = []
    configuration.allowsInlineMediaPlayback = true
    configuration.userContentController.addUserScript(WKUserScript(source: PageScripts.host, injectionTime: .atDocumentStart, forMainFrameOnly: true))
    webView = WKWebView(frame: .zero, configuration: configuration)
    super.init(nibName: nil, bundle: nil)
    configuration.userContentController.add(WeakMessageHandler(self), name: PageScripts.channel)
    report = Report.fromLaunchArguments(webView: webView, configuration: configuration)
    power.onRunningChange = { [weak self] running in self?.run(running) }
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

  /// Some of the app's window can be seen (its scene is in the foreground, focused or not).
  var visible: Bool {
    get { power.visible }
    set { power.visible = newValue }
  }

  override func loadView() {
    let view = UIView()
    view.backgroundColor = PageScripts.background
    webView.isOpaque = false
    webView.backgroundColor = PageScripts.background
    webView.scrollView.backgroundColor = PageScripts.background
    // The page is one canvas laid out by the game: nothing scrolls, zooms or bounces, and the
    // game is told the safe area itself (safeAreaDidChange) rather than being inset by it.
    webView.scrollView.contentInsetAdjustmentBehavior = .never
    webView.scrollView.isScrollEnabled = false
    webView.scrollView.bounces = false
    webView.scrollView.delegate = self
    webView.allowsLinkPreview = false
    webView.navigationDelegate = self
    #if DEBUG
      webView.isInspectable = true
    #endif
    webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    webView.frame = view.bounds
    view.addSubview(webView)
    splash.contentMode = .scaleAspectFill
    splash.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    splash.frame = view.bounds
    view.addSubview(splash)
    report?.attach(to: view)
    self.view = view
  }

  override func viewDidLoad() {
    super.viewDidLoad()
    webView.load(URLRequest(url: BundleSchemeHandler.home))
    // A page that never draws (a script error while loading) isn't hidden for good.
    DispatchQueue.main.asyncAfter(deadline: .now() + 30) { [weak self] in self?.reveal() }
  }

  override var prefersStatusBarHidden: Bool { true }
  override var prefersHomeIndicatorAutoHidden: Bool { true }

  override func viewSafeAreaInsetsDidChange() {
    super.viewSafeAreaInsetsDidChange()
    tellSafeArea()
  }

  func viewForZooming(in scrollView: UIScrollView) -> UIView? { nil }

  func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
    guard let body = message.body as? [String: Any] else { return }
    report?.received(body)
    if body["ready"] as? Bool == true { reveal() }
    guard let screen = body["screen"] as? String else { return }
    let wallpaper = body["wallpaper"] as? Bool ?? false
    power.wallpaper = wallpaper
    haptics.update(screen: screen, wallpaper: wallpaper, tool: body["tool"] as? String,
                   touch: body["touch"] as? Double ?? 0, takeoffs: body["takeoffs"] as? Int ?? 0)
  }

  func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) { tellSafeArea() }

  /// A keyboard (an iPad's, or one paired with a phone) types into the first responder: the page,
  /// where the game reads its keys as the remote's buttons.
  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { webView.becomeFirstResponder() }

  /// iOS may end the page's process to reclaim memory, mostly while the app is in the background:
  /// start the game again (its settings are kept; the fly's moment is not).
  func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
    report?.log("web content process ended; reloading")
    webView.load(URLRequest(url: BundleSchemeHandler.home))
  }

  func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction) async -> WKNavigationActionPolicy {
    action.request.url?.scheme == BundleSchemeHandler.scheme ? .allow : .cancel
  }

  /// What the notch, the home indicator, rounded corners and a window's controls cover, in CSS
  /// pixels (the page is a point to a pixel). The game reads `__flySafeArea` on the next `resize`
  /// (packages/contracts/src/screen.ts).
  private func tellSafeArea() {
    let inset = view.safeAreaInsets
    let js = "window.\(PageScripts.safeAreaProperty) = { top: \(inset.top), right: \(inset.right), bottom: \(inset.bottom), left: \(inset.left) }; dispatchEvent(new Event(\"resize\"));"
    webView.evaluateJavaScript(js)
  }

  private func run(_ running: Bool) {
    report?.log(running ? "running" : "paused")
    if running {
      webView.frame = view.bounds
      view.insertSubview(webView, at: 0)
      still?.removeFromSuperview()
      still = nil
      webView.becomeFirstResponder()
    } else {
      let still = webView.snapshotView(afterScreenUpdates: false) ?? UIView()
      still.frame = webView.frame
      still.autoresizingMask = [.flexibleWidth, .flexibleHeight]
      view.insertSubview(still, aboveSubview: webView)
      self.still = still
      webView.removeFromSuperview()
    }
  }

  private func reveal() {
    guard !shown else { return }
    shown = true
    report?.log("first screen")
    UIView.animate(withDuration: 0.4, animations: { self.splash.alpha = 0 }, completion: { _ in self.splash.removeFromSuperview() })
  }
}

/// WKUserContentController keeps its handlers strongly; this keeps the controller from being kept alive by its own page.
final class WeakMessageHandler: NSObject, WKScriptMessageHandler {
  private weak var target: (any WKScriptMessageHandler)?
  init(_ target: any WKScriptMessageHandler) { self.target = target }
  func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
    target?.userContentController(controller, didReceive: message)
  }
}
