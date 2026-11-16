import XCTest

/// The game's state as the app reports it (`-FlyReport`, src/Report.swift): the canvas's `data-*`
/// and the page's counters, as the value of the `fly-report` accessibility element.
struct Report {
  let raw: String
  private let page: [String: Any]
  private let host: [String: Any]

  init?(_ raw: String) {
    guard let json = try? JSONSerialization.jsonObject(with: Data(raw.utf8)) as? [String: Any], let page = json["page"] as? [String: Any],
          let host = json["host"] as? [String: Any] else { return nil }
    self.raw = raw
    self.page = page
    self.host = host
  }

  func data(_ key: String) -> String? { (page["dataset"] as? [String: Any])?[key] as? String }
  var frames: Int { page["frames"] as? Int ?? 0 }
  var pointers: Int { page["pointers"] as? Int ?? 0 }
  var keys: Int { page["keys"] as? Int ?? 0 }
  var cached: Int? { page["cached"] as? Int }
  var firstRow: [Double]? { page["firstRow"] as? [Double] }
  var speed: Double { page["speed"] as? Double ?? 0 }
  var brainWallMs: Double { page["brainWallMs"] as? Double ?? 0 }
  var brainSimMs: Double { page["brainSimMs"] as? Double ?? 0 }
  var visible: Bool { page["visibility"] as? String == "visible" }
  /// The table in the page's address, which the game keeps there while it is at one.
  var table: String? { page["table"] as? String }
  var atMs: Double { (host["atMs"] as? Double) ?? 0 }
}

struct Failure: Error, CustomStringConvertible {
  let description: String
  init(_ description: String) { self.description = description }
}

@MainActor
extension XCUIApplication {
  func report() throws -> Report {
    let element = descendants(matching: .any)["fly-report"]
    guard element.exists, let value = element.value as? String, let report = Report(value) else { throw Failure("no report") }
    return report
  }

  @discardableResult
  func wait(_ what: String, timeout: TimeInterval = 20, _ done: (Report) -> Bool) throws -> Report {
    let until = Date().addingTimeInterval(timeout)
    var last: Report?
    while Date() < until {
      if let state = try? report() {
        last = state
        if done(state) { return state }
      }
      Thread.sleep(forTimeInterval: 0.25)
    }
    throw Failure("waited \(Int(timeout)) s for \(what); last report \(last?.raw ?? "none")")
  }

  /// Taps the first row of the menu showing (on the title, Visit the fly), which the report says where to find.
  func tapFirstRow(_ state: Report) throws {
    let row = try XCTUnwrap(state.firstRow, "the menu's first row on screen")
    webViews.firstMatch.coordinate(withNormalizedOffset: CGVector(dx: row[0], dy: row[1])).tap()
  }
}
