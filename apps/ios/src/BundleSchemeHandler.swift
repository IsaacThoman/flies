import Foundation
import UniformTypeIdentifiers
import WebKit

/// Serves the web build bundled with the app (`www/`) at `fly://app/`, so the page, its module
/// worker and the 38 MB connectome load from the app itself: no network and no local server.
///
/// Files are memory-mapped and sent in slices, one per turn of the main run loop, so the
/// connectome's download progress is real and the main thread never stalls on it.
final class BundleSchemeHandler: NSObject, WKURLSchemeHandler {
  static let scheme = "fly"
  static let home = URL(string: "fly://app/index.html")!
  private static let slice = 1 << 20

  private let root: URL
  /// Tasks WebKit has not stopped. Calling a stopped task raises an exception.
  private var live = Set<ObjectIdentifier>()

  init(root: URL) {
    self.root = root.standardizedFileURL
  }

  func webView(_ webView: WKWebView, start task: any WKURLSchemeTask) {
    guard let url = task.request.url, let file = file(for: url) else {
      return fail(task, status: 404)
    }
    guard let data = try? Data(contentsOf: file, options: .alwaysMapped) else {
      return fail(task, status: 404)
    }
    let headers = [
      "Content-Type": Self.mimeType(of: file),
      "Content-Length": String(data.count),
      // The bundle is the app's own: nothing to revalidate within a run, and a new version is a new app.
      "Cache-Control": "no-cache",
    ]
    task.didReceive(HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: headers)!)
    live.insert(ObjectIdentifier(task))
    send(data, from: 0, to: task)
  }

  func webView(_ webView: WKWebView, stop task: any WKURLSchemeTask) {
    live.remove(ObjectIdentifier(task))
  }

  private func send(_ data: Data, from offset: Int, to task: any WKURLSchemeTask) {
    guard live.contains(ObjectIdentifier(task)) else { return }
    let end = min(offset + Self.slice, data.count)
    if end > offset { task.didReceive(data.subdata(in: offset..<end)) }
    if end == data.count {
      live.remove(ObjectIdentifier(task))
      task.didFinish()
      return
    }
    DispatchQueue.main.async { [weak self] in self?.send(data, from: end, to: task) }
  }

  private func fail(_ task: any WKURLSchemeTask, status: Int) {
    guard let url = task.request.url else { return task.didFailWithError(URLError(.badURL)) }
    task.didReceive(HTTPURLResponse(url: url, statusCode: status, httpVersion: "HTTP/1.1", headerFields: ["Content-Length": "0"])!)
    task.didFinish()
  }

  /// The bundled file a URL names, or nil if it is outside `www/` or isn't there.
  func file(for url: URL) -> URL? {
    guard url.host == "app" else { return nil }
    let path = url.path.isEmpty || url.path == "/" ? "/index.html" : url.path
    let file = root.appendingPathComponent(path).standardizedFileURL
    guard file.path.hasPrefix(root.path + "/") else { return nil }
    var directory: ObjCBool = false
    guard FileManager.default.fileExists(atPath: file.path, isDirectory: &directory), !directory.boolValue else { return nil }
    return file
  }

  static func mimeType(of file: URL) -> String {
    switch file.pathExtension {
    // JavaScript must be served as JavaScript for module scripts and module workers to run.
    case "js": "text/javascript"
    // The system takes .bin for MacBinary.
    case "bin": "application/octet-stream"
    default: UTType(filenameExtension: file.pathExtension)?.preferredMIMEType ?? "application/octet-stream"
    }
  }
}
