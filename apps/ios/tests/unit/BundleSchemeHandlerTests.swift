import XCTest

@testable import AppleTVFly

/// The scheme handler serves the bundled site and nothing else.
@MainActor
final class BundleSchemeHandlerTests: XCTestCase {
  /// A site in a fresh folder, with a file beside it that must not be served; the paths it serves, relative to its root.
  private func site() throws -> (String) -> String? {
    let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    let root = folder.appendingPathComponent("www")
    try FileManager.default.createDirectory(at: root.appendingPathComponent("assets"), withIntermediateDirectories: true)
    for file in ["index.html", "assets/index.js", "assets/brain.worker.js"] {
      try Data("x".utf8).write(to: root.appendingPathComponent(file))
    }
    try Data("secret".utf8).write(to: folder.appendingPathComponent("outside.txt"))
    addTeardownBlock { try? FileManager.default.removeItem(at: folder) }
    let handler = BundleSchemeHandler(root: root)
    let prefix = root.standardizedFileURL.path.count
    return { url in handler.file(for: URL(string: url)!).map { String($0.path.dropFirst(prefix)) } }
  }

  func testServesTheSiteFromItsRoot() throws {
    let served = try site()
    XCTAssertEqual(served("fly://app/"), "/index.html")
    XCTAssertEqual(served("fly://app"), "/index.html")
    XCTAssertEqual(served("fly://app/index.html"), "/index.html")
    XCTAssertEqual(served("fly://app/assets/index.js?v=1"), "/assets/index.js")
  }

  func testServesNothingOutsideIt() throws {
    let served = try site()
    XCTAssertNil(served("fly://app/../outside.txt"))
    XCTAssertNil(served("fly://app/%2E%2E/outside.txt"))
    XCTAssertNil(served("fly://app/assets/../../outside.txt"))
    XCTAssertNil(served("fly://elsewhere/index.html"))
    XCTAssertNil(served("fly://app/assets"), "a directory")
    XCTAssertNil(served("fly://app/missing.js"))
  }

  func testJavaScriptIsServedAsJavaScript() {
    XCTAssertEqual(BundleSchemeHandler.mimeType(of: URL(fileURLWithPath: "/a/index.js")), "text/javascript")
    XCTAssertEqual(BundleSchemeHandler.mimeType(of: URL(fileURLWithPath: "/a/index.html")), "text/html")
    XCTAssertEqual(BundleSchemeHandler.mimeType(of: URL(fileURLWithPath: "/a/brain/connectome.bin")), "application/octet-stream")
  }
}
