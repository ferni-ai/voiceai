import XCTest
@testable import FerniDesign

/// Design audit P2 #16: the medium widget never changed. Its hello and light
/// now follow the day.
final class WidgetMomentTests: XCTestCase {
    var calendar: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "America/New_York")!
        return c
    }()

    func testTheHelloFollowsHomesHours() {
        XCTAssertEqual([4, 5, 11, 12, 16, 17, 21, 22, 0].map(WidgetMoment.init(hour:)),
                       [.night, .morning, .morning, .afternoon, .afternoon, .evening, .evening, .night, .night])
    }

    /// Every hour where the hello or the light changes is in the timeline, and
    /// nothing else; a day's worth, starting after now.
    func testTheTimelineTurnsWhereverTheHelloOrTheLightDoes() throws {
        let now = try XCTUnwrap(calendar.date(from: DateComponents(year: 2026, month: 10, day: 20, hour: 13, minute: 40)))
        let turns = WidgetMoment.turns(after: now, calendar: calendar)
        XCTAssertEqual(turns.map { calendar.component(.hour, from: $0) }, [17, 18, 22, 23, 5, 11, 12])
        XCTAssertTrue(turns.allSatisfy { $0 > now })
        for hour in 0..<24 {
            let next = (hour + 1) % 24
            let changes = WidgetMoment(hour: hour) != WidgetMoment(hour: next) || RoomLight(hour: hour) != RoomLight(hour: next)
            XCTAssertEqual(changes, WidgetMoment.turns.contains(next), "between \(hour):00 and \(next):00")
        }
    }
}
