// The weather outside, for the game: globalThis.__native.weather (NativeWeatherBridge in
// packages/contracts/src/weather.ts). src/WeatherBridge.mm finds this class by its Objective-C
// name, so a build without it has no Swift at all and no __native.weather.
//
// The JavaScript thread only ever reads what is kept here, under a lock it holds for a copy.
// Finding the answer is the Service's, on the main actor: WeatherKit and Core Location
// (weather/WeatherKit), or the simulator check's stand-in (tests/weather-stand-in).
import Foundation

@objc(FlyOutsideWeather)
final class OutsideWeather: NSObject, Sendable {
  @objc static let shared = OutsideWeather()
  let answer = Answer()

  @objc func start() {
    let answer = self.answer
    Task { @MainActor in Service.shared.start(answer) }
  }
  @objc func stop() {
    let answer = self.answer
    Task { @MainActor in Service.shared.stop(answer) }
  }
  @objc var status: String { answer.status }
  @objc var error: String { answer.error }
  @objc var version: Int { answer.version }
  /** The last answer as JSON (OutsideConditions), or nil. */
  @objc var conditions: String? { answer.conditions }
  /** Apple Weather's attribution as JSON (WeatherAttribution), or nil. */
  @objc var attribution: String? { answer.attribution }
}

/** What the service has found, as the game reads it, and the last answer kept for the next run. */
final class Answer: @unchecked Sendable {
  // Every field below is read and written under `lock`.
  private let lock = NSLock()
  private var _status = "idle"
  private var _error = ""
  private var _version = 0
  private var _conditions: String?
  private var _attribution: String?
  private var _fetchedAt: Date?
  /** Conditions and when they were fetched; never where. */
  private static let key = "flies.outsideWeather"

  init() {
    if let kept = UserDefaults.standard.dictionary(forKey: Self.key), let c = kept["conditions"] as? String, let at = kept["fetchedAt"] as? Double {
      _conditions = c
      _fetchedAt = Date(timeIntervalSince1970: at)
      _version = 1
    }
  }

  private func locked<T>(_ body: () -> T) -> T {
    lock.lock()
    defer { lock.unlock() }
    return body()
  }

  var status: String { locked { _status } }
  var error: String { locked { _error } }
  var version: Int { locked { _version } }
  var conditions: String? { locked { _conditions } }
  var attribution: String? { locked { _attribution } }
  /** When the last answer was fetched, to know when to ask again. */
  var fetchedAt: Date? { locked { _fetchedAt } }

  func set(status: String, error: String = "") {
    locked {
      _status = status
      _error = error
    }
  }

  /** A new answer: `conditions` as OutsideConditions, null for nil. Kept for the next run. */
  func answered(_ conditions: [String: Any]) {
    guard let data = try? JSONSerialization.data(withJSONObject: conditions), let json = String(data: data, encoding: .utf8) else {
      set(status: "failed", error: "the answer couldn't be written as JSON")
      return
    }
    let now = Date.now
    locked {
      _conditions = json
      _fetchedAt = now
      _version += 1
      _status = "ok"
      _error = ""
    }
    UserDefaults.standard.set(["conditions": json, "fetchedAt": now.timeIntervalSince1970], forKey: Self.key)
  }

  func attributed(service: String, legalText: String, legalPage: String) {
    let a = ["service": service, "legalText": legalText, "legalPage": legalPage]
    guard let data = try? JSONSerialization.data(withJSONObject: a), let json = String(data: data, encoding: .utf8) else { return }
    locked { _attribution = json }
  }
}

/** A time as local hours from the midnight beginning `day`, by the clock (so a day the clocks change on still reads true); nil stays nil. */
func localHours(_ date: Date?, from day: Date) -> Any {
  guard let date else { return NSNull() }
  let calendar = Calendar.current
  let days = calendar.dateComponents([.day], from: day, to: calendar.startOfDay(for: date)).day ?? 0
  let t = calendar.dateComponents([.hour, .minute, .second], from: date)
  return Double(days * 24 + (t.hour ?? 0)) + Double(t.minute ?? 0) / 60 + Double(t.second ?? 0) / 3600
}
