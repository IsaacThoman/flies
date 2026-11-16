import UIKit

/// What the app adds to the page. The game knows nothing of the app: the app reads the state the
/// game publishes on its canvas (`data-*`, for scripts and hosts) and sets what a host decides.
enum PageScripts {
  /// The message handler the page's scripts post to.
  static let channel = "host"
  /// Where a host puts the safe area for the game (`SAFE_AREA_PROPERTY`, packages/contracts/src/screen.ts).
  static let safeAreaProperty = "__flySafeArea"
  /// The page's own background (apps/web/index.html), behind the web view while it loads.
  static let background = UIColor(red: 0x04 / 255, green: 0x12 / 255, blue: 0x2b / 255, alpha: 1)

  /// Whenever what the app follows changes (the game having drawn its first screen, the screen, the
  /// wallpaper, and for haptics the tool, the fly's touch and its take-offs), tells the app: the
  /// canvas's state is set every 200 ms, and only changes are sent.
  static let host = """
  addEventListener("DOMContentLoaded", () => {
    const canvas = document.getElementById("game");
    if (!canvas) return;
    const keys = ["ready", "screen", "wallpaper", "tool", "touch", "takeoffs"];
    let last = "";
    new MutationObserver(() => {
      const d = canvas.dataset;
      const now = keys.map((key) => d[key]).join(" ");
      if (now === last) return;
      last = now;
      webkit.messageHandlers.\(channel).postMessage({
        ready: d.ready === "true", screen: d.screen, wallpaper: d.wallpaper === "true", tool: d.tool, touch: Number(d.touch) || 0, takeoffs: Number(d.takeoffs) || 0,
      });
    }).observe(canvas, { attributes: true, attributeFilter: keys.map((key) => `data-${key}`) });
  });
  """
}
