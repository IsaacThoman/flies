// The weather outside from WeatherKit, where the Apple TV is (Core Location): built in only with
// TVOS_WEATHERKIT=1, on an App ID with the WeatherKit capability (docs/apple-tv.md).
//
//   - Asks for When In Use permission the first time (tvOS has no other kind), then for one
//     location fix at a time (tvOS has requestLocation, not continuous updates). The TV doesn't
//     move: a fix is used for six hours. Its coordinates are rounded to two decimal places
//     (about a kilometre, "coarse" in Apple's terms) before they go to WeatherKit, and are never
//     saved or handed to JavaScript.
//   - Asks WeatherKit for the current conditions and today's sun in one request (one call
//     against the quota), then again every 20 minutes while the app is open, never sooner than
//     the answer expires. After a failure it tries again sooner, backing off to 20 minutes.
//     Timers don't fire while the app is suspended; on becoming active it asks again if the
//     answer is old.
//   - Runs on the main actor; the JavaScript thread only reads the Answer.
import CoreLocation
import UIKit
import WeatherKit

@MainActor
final class Service: NSObject, CLLocationManagerDelegate {
  static let shared = Service()
  /** Seconds between requests while the app is open. */
  static let every: TimeInterval = 20 * 60
  /** Seconds a location fix is used for. */
  static let relocate: TimeInterval = 6 * 3600

  private var answer: Answer?
  private var manager: CLLocationManager?
  private var running = false
  /** Rounded, as sent; in memory only. */
  private var place: CLLocationCoordinate2D?
  private var placedAt = Date.distantPast
  /** A location fix or a WeatherKit request is out. */
  private var asking = false
  private var failures = 0
  private var timer: Timer?

  func start(_ answer: Answer) {
    self.answer = answer
    guard !running else { return }
    running = true
    if manager == nil {
      let m = CLLocationManager()
      // A TV's location comes from its network anyway; a kilometre is all the weather needs.
      m.desiredAccuracy = kCLLocationAccuracyKilometer
      m.delegate = self
      manager = m
      NotificationCenter.default.addObserver(self, selector: #selector(becameActive), name: UIApplication.didBecomeActiveNotification, object: nil)
    }
    refresh()
  }

  func stop(_ answer: Answer) {
    running = false
    timer?.invalidate()
    timer = nil
    answer.set(status: "idle")
  }

  @objc private func becameActive() { refresh() }

  private func refresh() {
    guard running, !asking, let manager, let answer else { return }
    timer?.invalidate()
    timer = nil
    let age = answer.fetchedAt.map { Date.now.timeIntervalSince($0) } ?? .infinity
    if age >= 0 && age < Self.every {
      wait(Self.every - age)
      return
    }
    switch manager.authorizationStatus {
    case .notDetermined:
      // The answer comes to locationManagerDidChangeAuthorization.
      answer.set(status: "locating")
      manager.requestWhenInUseAuthorization()
    case .denied, .restricted:
      answer.set(status: "denied", error: "location permission isn't given")
    default:
      if let place, Date.now.timeIntervalSince(placedAt) < Self.relocate {
        fetch(place)
      } else {
        asking = true
        answer.set(status: "locating")
        manager.requestLocation()
      }
    }
  }

  private func wait(_ seconds: TimeInterval) {
    timer?.invalidate()
    timer = Timer.scheduledTimer(withTimeInterval: max(1, seconds), repeats: false) { _ in
      MainActor.assumeIsolated { Service.shared.refresh() }
    }
  }

  /** Sooner after a failure, backing off: 1, 2, 4... minutes, to the usual interval. */
  private func retry() {
    failures += 1
    wait(min(Self.every, 60 * pow(2, Double(failures - 1))))
  }

  nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
    MainActor.assumeIsolated { Service.shared.refresh() }
  }

  nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
    let coordinate = locations.last?.coordinate
    MainActor.assumeIsolated { Service.shared.located(coordinate) }
  }

  nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
    let denied = (error as? CLError)?.code == .denied
    let description = error.localizedDescription
    MainActor.assumeIsolated { Service.shared.locationFailed(denied: denied, description) }
  }

  private func located(_ coordinate: CLLocationCoordinate2D?) {
    asking = false
    guard running, let coordinate else { return }
    let rounded = CLLocationCoordinate2D(latitude: (coordinate.latitude * 100).rounded() / 100, longitude: (coordinate.longitude * 100).rounded() / 100)
    place = rounded
    placedAt = .now
    fetch(rounded)
  }

  private func locationFailed(denied: Bool, _ description: String) {
    asking = false
    guard running else { return }
    answer?.set(status: denied ? "denied" : "no-location", error: description)
    if !denied { retry() }
  }

  private func fetch(_ place: CLLocationCoordinate2D) {
    guard let answer else { return }
    asking = true
    answer.set(status: "fetching")
    let wantsAttribution = answer.attribution == nil
    Task {
      do {
        let calendar = Calendar.current
        let today = calendar.startOfDay(for: .now)
        let tomorrow = calendar.date(byAdding: .day, value: 1, to: today) ?? today.addingTimeInterval(86_400)
        let location = CLLocation(latitude: place.latitude, longitude: place.longitude)
        let (current, days) = try await WeatherService.shared.weather(for: location, including: .current, .daily(startDate: today, endDate: tomorrow))
        let sun = days.forecast.first?.sun
        answer.answered([
          "source": "weatherkit",
          "observedAt": (current.date.timeIntervalSince1970 * 1000).rounded(),
          "cloudCover": current.cloudCover,
          // WeatherKit gives the intensity as a speed, in km/h: a millimetre an hour is a millionth of that.
          "precipitation": current.precipitationIntensity.converted(to: .kilometersPerHour).value * 1_000_000,
          "visibility": current.visibility.converted(to: .meters).value,
          "wind": current.wind.speed.converted(to: .metersPerSecond).value,
          "condition": current.condition.rawValue,
          "daylight": current.isDaylight,
          "sunrise": localHours(sun?.sunrise, from: today),
          "sunset": localHours(sun?.sunset, from: today),
          // Where the sun never comes up, its lowest is the one WeatherKit gives: its highest is twelve hours from it.
          "noon": localHours(sun?.solarNoon ?? sun?.solarMidnight.map { $0.addingTimeInterval(-12 * 3600) }, from: today),
        ])
        if wantsAttribution {
          let a = try await WeatherService.shared.attribution
          answer.attributed(service: a.serviceName, legalText: a.legalAttributionText, legalPage: a.legalPageURL.absoluteString)
        }
        asking = false
        failures = 0
        // Stopped while it was asked: the answer is kept, and it says it has stopped.
        guard running else { return answer.set(status: "idle") }
        wait(min(3600, max(Self.every, current.metadata.expirationDate.timeIntervalSinceNow)))
      } catch {
        asking = false
        guard running else { return answer.set(status: "idle") }
        let (status, description) = Self.classify(error)
        answer.set(status: status, error: description)
        retry()
      }
    }
  }

  /** What went wrong, as OutsideStatus: the network, WeatherKit refusing the app, or anything else. */
  private static func classify(_ error: Error) -> (String, String) {
    let ns = error as NSError
    let description = "\(ns.domain) \(ns.code): \(ns.localizedDescription)"
    if let weather = error as? WeatherError, case .permissionDenied = weather { return ("unauthorised", description) }
    if ns.domain == NSURLErrorDomain { return ("offline", description) }
    // Without the capability on the App ID, WeatherKit's daemon can't get the app a token.
    if ns.domain.contains("JWTAuthenticator") { return ("unauthorised", description) }
    return ("failed", description)
  }
}
