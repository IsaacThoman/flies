import XCTest

@testable import Flies

/// Which links open a table, and the page and script the game is given for them.
@MainActor
final class LinksTests: XCTestCase {
  private func table(_ link: String) -> String? { Links.table(in: URL(string: link)!) }

  func testATablesLinkToTheSiteGivesItsCode() {
    XCTAssertEqual(table("https://flies.isaacthoman.com/?table=k3m9xq2rtv"), "k3m9xq2rtv")
    XCTAssertEqual(table("https://flies.isaacthoman.com?table=k3m9xq2rtv"), "k3m9xq2rtv", "no path")
    XCTAssertEqual(table("https://Flies.IsaacThoman.com/?table=k3m9xq2rtv"), "k3m9xq2rtv", "a host is any case")
    XCTAssertEqual(table("https://flies.isaacthoman.com/?rooms=ws://elsewhere/rooms&table=k3m9xq2rtv#x"), "k3m9xq2rtv", "only the code is taken")
  }

  func testAnythingElseIsIgnored() {
    for link in [
      "http://flies.isaacthoman.com/?table=k3m9xq2rtv",
      "fly://app/?table=k3m9xq2rtv",
      "https://elsewhere.example/?table=k3m9xq2rtv",
      "https://flies.isaacthoman.com.elsewhere.example/?table=k3m9xq2rtv",
      "https://someone@flies.isaacthoman.com/?table=k3m9xq2rtv",
      "https://flies.isaacthoman.com:8443/?table=k3m9xq2rtv",
      "https://flies.isaacthoman.com/rooms?table=k3m9xq2rtv",
      "https://flies.isaacthoman.com/",
      "https://flies.isaacthoman.com/?table=",
      "https://flies.isaacthoman.com/?table=k3m9xq2rt",
      "https://flies.isaacthoman.com/?table=k3m9xq2rtvv",
      "https://flies.isaacthoman.com/?table=K3M9XQ2RTV",
      "https://flies.isaacthoman.com/?table=k3m9xq2rt1",
      "https://flies.isaacthoman.com/?table=k3m9xq2r%22)",
    ] {
      XCTAssertNil(table(link), link)
    }
  }

  func testThePageSaysTheRoomServerAndTheTable() {
    XCTAssertEqual(Links.page(rooms: nil, table: nil).absoluteString, "fly://app/index.html")
    XCTAssertEqual(Links.page(rooms: nil, table: "k3m9xq2rtv").absoluteString, "fly://app/index.html?table=k3m9xq2rtv")
    let page = Links.page(rooms: "ws://127.0.0.1:8787/rooms", table: "k3m9xq2rtv")
    let items = URLComponents(url: page, resolvingAgainstBaseURL: false)!.queryItems!
    XCTAssertEqual(items, [URLQueryItem(name: "rooms", value: "ws://127.0.0.1:8787/rooms"), URLQueryItem(name: "table", value: "k3m9xq2rtv")])
  }

  func testTheRunningGameIsHandedTheSitesLink() {
    XCTAssertEqual(Links.invite(to: "k3m9xq2rtv"), #"dispatchEvent(new CustomEvent("flyinvite", { detail: "https://flies.isaacthoman.com/?table=k3m9xq2rtv" }));"#)
  }
}
