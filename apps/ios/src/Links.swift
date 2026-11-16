import Foundation

/// The page's address, and the table links that open the app.
///
/// A table's link is the site's page with the table's code, `https://flies.isaacthoman.com/?table=<code>`
/// (apps/web/src/online/invite.ts). Built with the Associated Domains capability (`IOS_LINKS=1`,
/// links.yml), iOS opens the app for it instead of Safari. Only such a link is taken: https, to this
/// site, its own page, with a code that could be a table's. The game is given the code and nothing
/// else of the link, so no link can point it at another room server or page.
@MainActor
enum Links {
  /// The site whose table links open the app, as links.yml's entitlement names it.
  static let site = "flies.isaacthoman.com"
  /// The event the game sits down at a table on while it runs (INVITE_EVENT, packages/contracts/src/invite.ts).
  static let inviteEvent = "flyinvite"
  /// What a table's code is made of (CODE_ALPHABET and CODE_LENGTH, packages/net/src/protocol.ts).
  private static let codeAlphabet = Set("23456789abcdefghjkmnpqrstuvwxyz")
  private static let codeLength = 10

  /// The table a link invites to, or nil if it isn't a table's link to this site.
  static func table(in url: URL) -> String? {
    guard url.scheme?.lowercased() == "https", url.host?.lowercased() == site, url.port == nil || url.port == 443,
          url.user == nil, url.path.isEmpty || url.path == "/",
          let code = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.first(where: { $0.name == "table" })?.value,
          code.count == codeLength, code.allSatisfy(codeAlphabet.contains) else { return nil }
    return code
  }

  /// The table's link as the game takes it: the site's page with the code alone.
  static func link(to table: String) -> String {
    "https://\(site)/?table=\(table)"
  }

  /// The game's page: with the room server to use instead of the site's (`-FlyRooms`, for development
  /// and checks), and the table it was opened for, which the game sits down at as it starts.
  static func page(rooms: String?, table: String?) -> URL {
    var page = URLComponents(url: BundleSchemeHandler.home, resolvingAgainstBaseURL: false)!
    let items = [rooms.map { URLQueryItem(name: "rooms", value: $0) }, table.map { URLQueryItem(name: "table", value: $0) }].compactMap { $0 }
    page.queryItems = items.isEmpty ? nil : items
    return page.url!
  }

  /// Tells the running game it was invited to a table: it leaves the one it is at, if any, and sits down there.
  static func invite(to table: String) -> String {
    let link = String(data: try! JSONSerialization.data(withJSONObject: link(to: table), options: [.fragmentsAllowed, .withoutEscapingSlashes]),encoding: .utf8)!
    return "dispatchEvent(new CustomEvent(\"\(inviteEvent)\", { detail: \(link) }));"
  }
}
