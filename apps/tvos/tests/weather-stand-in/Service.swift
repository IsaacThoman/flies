// A stand-in for the weather service (apps/tvos/weather/WeatherKit), for the simulator check:
// no WeatherKit, no location, no permission to ask. Started, it answers a moment later with the
// same conditions every time, observed five minutes before, and an attribution that says it is
// a stand-in; simulator.tvos.ts checks they reach the test scene as sent.
import Foundation

@MainActor
final class Service {
  static let shared = Service()

  func start(_ answer: Answer) {
    answer.set(status: "fetching")
    Task {
      try? await Task.sleep(for: .milliseconds(300))
      answer.answered([
        "source": "stand-in",
        "observedAt": ((Date.now.timeIntervalSince1970 - 300) * 1000).rounded(),
        "cloudCover": 0.62,
        "precipitation": 0.4,
        "visibility": 2400,
        "wind": 5.5,
        "condition": "drizzle",
        "daylight": true,
        "sunrise": 7.25,
        "sunset": 16.75,
        "noon": 12.0,
      ])
      answer.attributed(service: "Stand-in weather", legalText: "Not real weather: the simulator check's stand-in.", legalPage: "http://fly.local/stand-in")
    }
  }

  func stop(_ answer: Answer) {
    answer.set(status: "idle")
  }
}
