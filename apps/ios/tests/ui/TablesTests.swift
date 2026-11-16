import XCTest

/// The fly at a table with others, from the app: opened by a table's link, it sits down and sees
/// the fly already there; sent to the background, it rests there and its device stops; in front
/// again it is back at the table in the same seat; and a second table's link, opened while it runs,
/// takes it there. Run by `npm run ios:check` (apps/ios/tests/simulator.ios.ts), which starts a room
/// server and a fake fly at each table, says where they are, watches the room's side of it, and
/// reads the `check-tables:` line this prints.
@MainActor
final class TablesTests: XCTestCase {
  private let app = XCUIApplication()

  override func setUp() {
    continueAfterFailure = false
  }

  func testAtATable() throws {
    let env = ProcessInfo.processInfo.environment
    guard let rooms = env["FLY_ROOMS"], let first = env["FLY_TABLE"], let second = env["FLY_NEXT_TABLE"] else {
      throw XCTSkip("needs a room server and its tables (npm run ios:check)")
    }
    let link = { (table: String) in "https://flies.isaacthoman.com/?table=\(table)" }
    // The others at the table, by id, that this device sees there.
    let others = { (state: Report) in
      Set((state.data("others") ?? "").split(separator: ";").compactMap { entry -> Substring? in
        let fields = entry.split(separator: ":")
        return fields.count > 1 && fields[1] == "1" ? fields[0] : nil
      })
    }

    // Opened by the first table's link, as a universal link would open it from Messages.
    app.launchArguments = ["-FlyReport", "0.25", "-FlyRooms", rooms, "-FlyInvite", link(first), "-FlyInviteLater", link(second)]
    let launched = Date()
    app.launch()
    let seated = try app.wait("a seat at the table, with the fly already there", timeout: 180) {
      $0.data("online") == "joined" && $0.table == first && !others($0).isEmpty
    }
    let joinS = Date().timeIntervalSince(launched)
    let player = try XCTUnwrap(seated.data("player"))
    let colour = try XCTUnwrap(seated.data("colour"))
    let reconnects = Int(seated.data("reconnects") ?? "") ?? 0
    let title = try app.wait("the title") { $0.data("screen") == "title" && $0.firstRow != nil }
    try app.tapFirstRow(title)
    try app.wait("play, at the table") { $0.data("screen") == "play" }

    // Away (another app over the whole screen), as a phone is whenever its owner does something
    // else: iOS suspends the app, and the fly rests at the table until it is back.
    XCUIApplication(bundleIdentifier: "com.apple.Preferences").activate()
    // Settings can take a while to come up on a busy Mac: away is counted from when the app has gone.
    XCTAssertTrue(app.wait(for: .runningBackgroundSuspended, timeout: 60) || app.state == .runningBackground, "in the background")
    print("check-tables: away")
    sleep(10)
    let returned = Date()
    print("check-tables: back")
    app.activate()
    let back = try app.wait("back at the table", timeout: 30) {
      $0.visible && $0.data("online") == "joined" && $0.table == first && !others($0).isEmpty && $0.frames > seated.frames
    }
    let rejoinS = Date().timeIntervalSince(returned)
    XCTAssertEqual(back.data("player"), player, "the same seat")
    XCTAssertEqual(back.data("colour"), colour, "the same colour")
    let reconnectsAway = (Int(back.data("reconnects") ?? "") ?? 0) - reconnects
    if let path = env["FLY_TABLE_SCREENSHOT"] {
      try XCUIScreen.main.screenshot().pngRepresentation.write(to: URL(fileURLWithPath: path))
    }

    // The second table's link, handed to the running app as iOS hands it a universal link
    // (`-FlyInviteLater`, src/App.swift): it leaves the first table and sits down there.
    let invited = Date()
    let center = CFNotificationCenterGetDarwinNotifyCenter()
    CFNotificationCenterPostNotification(center, CFNotificationName("com.isaacthoman.flies.invite-now" as CFString), nil, nil, true)
    let moved = try app.wait("a seat at the second table", timeout: 30) {
      $0.data("online") == "joined" && $0.table == second && !others($0).isEmpty
    }
    let inviteS = Date().timeIntervalSince(invited)
    XCTAssertGreaterThan(moved.atMs, back.atMs, "the same run of the app, not a new one")

    print("check-tables: {\"joinS\":\(joinS),\"player\":\(player),\"colour\":\"\(colour)\",\"rejoinS\":\(rejoinS),\"reconnectsAway\":\(reconnectsAway),\"inviteS\":\(inviteS),\"secondPlayer\":\(moved.data("player") ?? "0")}")
  }
}
