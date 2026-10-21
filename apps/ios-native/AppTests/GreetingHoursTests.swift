import FerniDesign
import XCTest
@testable import Ferni

/// Critic L6: Home's hello and the widget's kept two copies of the same
/// hours. Home reads WidgetMoment's, so at every hour the two say the same.
final class GreetingHoursTests: XCTestCase {
    func testHomeAndTheWidgetTurnOverAtTheSameHours() {
        var said: [WidgetMoment: String] = [:]
        for hour in 0..<24 {
            let moment = WidgetMoment(hour: hour), hello = Greeting.headline(hour: hour, firstVisit: false)
            if let before = said[moment] {
                XCTAssertEqual(hello, before, "\(hour):00 is \(moment) on the widget")
            }
            said[moment] = hello
        }
        XCTAssertEqual(Set(said.values).count, 4, "one hello per part of the day: \(said)")
    }
}
