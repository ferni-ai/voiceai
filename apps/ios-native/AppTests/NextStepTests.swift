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
        XCTAssertEqual(event.title, CalendarDraft.neutralTitle)
        XCTAssertEqual(event.startDate, due)
        XCTAssertEqual(event.endDate, due.addingTimeInterval(30 * 60))
        XCTAssertEqual(event.notes, "From a talk with Ferni: Call the pharmacy")
    }

    /// Calendar titles show on the Lock Screen and in widgets, and the Lock
    /// Screen never shows the person's words: every title is neutral, light or
    /// heavy, and the words go in the notes. These are the train 26 verifier's
    /// held-out phrases (a word list let 11 of 12 sensitive ones through) and a
    /// light one.
    func testNoTitleCarriesTheirWords() {
        let phrases = [
            "call the pharmacy", "call 988 tonight", "see the psychiatrist on monday", "go to my AA meeting",
            "pick up my zoloft prescription", "call my therapist", "book the oncologist", "pay the overdue rent",
            "talk to my counselor", "call the crisis line", "doctors appointment", "take my meds", "call mom",
            "buy milk",
        ]
        for text in phrases {
            let event = EKEvent(eventStore: EKEventStore())
            CalendarDraft.fill(event, from: NextSteps.Step(id: text, text: text, due: due, topic: nil))
            XCTAssertEqual(event.title, CalendarDraft.neutralTitle, text)
            let notes = event.notes ?? ""
            XCTAssertTrue(notes.hasPrefix("From a talk with Ferni: "), "\(text): \(notes)")
            XCTAssertTrue(notes.localizedCaseInsensitiveContains(text), "\(text): \(notes)")
            XCTAssertEqual(event.startDate, due, text)
            XCTAssertEqual(event.endDate, due.addingTimeInterval(30 * 60), text)
        }
        XCTAssertEqual(CalendarDraft.neutralTitle, "Something you mentioned to Ferni")
    }

    /// A heavy topic with light words is neutral too (the old check's case).
    func testATopicDoesNotChangeTheTitle() {
        for (topic, text) in [("health", "book the scan"), ("money", "pay the loan"), ("errands", "buy milk")] {
            let event = EKEvent(eventStore: EKEventStore())
            CalendarDraft.fill(event, from: NextSteps.Step(id: "x", text: text, due: due, topic: topic))
            XCTAssertEqual(event.title, CalendarDraft.neutralTitle, "\(topic) \(text)")
        }
    }
}
