import EventKit
import FerniKit
import XCTest
@testable import Ferni

/// Ecosystem items 3 and 4: a next step goes to the person's calendar (the
/// system's event sheet, no permission) or to any app through the share sheet.
final class NextStepTests: XCTestCase {
    private let due = Date(timeIntervalSince1970: 1_760_727_600) // Fri 17 Oct 2025, 15:00 America/New_York

    func testTheShareTextIsTheirWordsAndTheTime() {
        let step = NextSteps.Step(id: "c3", text: "call the pharmacy", due: due, topic: "errands")
        let text = StepWords.share(step, locale: Locale(identifier: "en_US"), timeZone: TimeZone(identifier: "America/New_York")!)
        // ICU puts a narrow no-break space before "PM"; compare the words.
        XCTAssertEqual(text.replacingOccurrences(of: "\u{202F}", with: " "), "Call the pharmacy, Fri 3:00 PM")
        XCTAssertFalse(text.localizedCaseInsensitiveContains("ferni"), "no signature on their own words")
        let undated = NextSteps.Step(id: "c2", text: "download last year's statements", due: nil, topic: nil)
        XCTAssertEqual(StepWords.share(undated), "Download last year's statements")
    }

    func testTheCalendarEventIsPrefilledForTheSheet() {
        let event = EKEvent(eventStore: EKEventStore())
        CalendarDraft.fill(event, from: NextSteps.Step(id: "c3", text: "call the pharmacy", due: due, topic: "errands"))
        XCTAssertEqual(event.title, "Call the pharmacy")
        XCTAssertEqual(event.startDate, due)
        XCTAssertEqual(event.endDate, due.addingTimeInterval(30 * 60))
        XCTAssertEqual(event.notes, "From a talk with Ferni.")
    }

    /// Calendars show on the Lock Screen and in widgets: a heavy topic gets a
    /// neutral title the person can change in the sheet.
    func testAHeavyTopicGetsANeutralTitle() {
        for (topic, text) in [("health", "book the scan"), ("money", "pay the loan"), (nil, "call the lawyer about custody")] {
            let event = EKEvent(eventStore: EKEventStore())
            CalendarDraft.fill(event, from: NextSteps.Step(id: "x", text: text, due: due, topic: topic))
            XCTAssertEqual(event.title, CalendarDraft.neutralTitle, "\(topic ?? "-") \(text)")
        }
        XCTAssertEqual(CalendarDraft.neutralTitle, "Something you mentioned to Ferni")
    }
}
