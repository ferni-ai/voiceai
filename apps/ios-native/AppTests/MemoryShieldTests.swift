import FerniKit
import FerniVoice
import XCTest
@testable import Ferni

/// Trust panel R11: with the lock on and locked, Home shows no words of yours
/// (the follow-up and the note), only that there's something; the app
/// switcher's snapshot is blurred whenever memory is on screen.
@MainActor
final class MemoryShieldTests: XCTestCase {
    private let note = HomeLineStore.Home.Note(id: "5f2c9a1e7b3d4c80", text: "how Sunday evenings feel heavy", createdAt: nil)
    private var full: HomeLineStore.Home { .init(greeting: .followUp(text: "the divorce lawyer search", topicID: "t1"), note: note) }

    private func detail(_ home: HomeLineStore.Home?) -> String {
        RestingWords.words(home: home, ended: false, hour: 9, hasTalked: true).detail
    }

    func testUnlockedHomeIsUnchanged() {
        let shield = MemoryShield.home(full, locked: false)
        XCTAssertEqual(shield.shown, full)
        XCTAssertNil(shield.placeholder)
        XCTAssertEqual(detail(shield.shown), "How's the divorce lawyer search going?")
    }

    func testLockedHomeShowsNoWordsOfYours() {
        let shield = MemoryShield.home(full, locked: true)
        XCTAssertNil(shield.shown?.note, "no note")
        XCTAssertEqual(shield.shown?.greeting, .timeOfDay, "the clock's words, not the follow-up")
        XCTAssertEqual(detail(shield.shown), "Whenever you're ready, I'm here.")
        XCTAssertEqual(RestingWords.words(home: shield.shown, ended: false, hour: 9, hasTalked: true).headline, "Good morning.")
        XCTAssertEqual(shield.placeholder, .note)
    }

    func testALockedFollowUpAloneSaysThereIsOne() {
        let shield = MemoryShield.home(.init(greeting: .followUp(text: "the garden", topicID: nil), note: nil), locked: true)
        XCTAssertEqual(shield.shown?.greeting, .timeOfDay)
        XCTAssertEqual(shield.placeholder, .followUp)
    }

    func testNothingOfYoursNothingToUnlock() {
        let plain = HomeLineStore.Home(greeting: .firstVisit, note: nil)
        XCTAssertEqual(MemoryShield.home(plain, locked: true).shown, plain, "a first visit stays a first visit")
        XCTAssertNil(MemoryShield.home(plain, locked: true).placeholder)
        XCTAssertNil(MemoryShield.home(nil, locked: true).shown)
        XCTAssertNil(MemoryShield.home(nil, locked: true).placeholder)
    }

    func testHomeShowsMemoryWithAFollowUpANoteOrTheCard() {
        XCTAssertTrue(MemoryShield.homeShowsMemory(full, phase: .idle))
        XCTAssertTrue(MemoryShield.homeShowsMemory(.init(greeting: .followUp(text: "x", topicID: nil), note: nil), phase: .idle))
        XCTAssertTrue(MemoryShield.homeShowsMemory(.init(greeting: .timeOfDay, note: note), phase: .idle))
        XCTAssertTrue(MemoryShield.homeShowsMemory(nil, phase: .ended), "the I'll remember card")
        XCTAssertFalse(MemoryShield.homeShowsMemory(.init(greeting: .timeOfDay, note: nil), phase: .idle))
        XCTAssertFalse(MemoryShield.homeShowsMemory(full, phase: .live), "in a call Home's line isn't shown")
    }

    func testTheSnapshotIsBlurredOnlyAwayWithMemoryOnScreen() {
        XCTAssertTrue(MemoryShield.coversSnapshot(active: false, memoryOnScreen: true))
        XCTAssertFalse(MemoryShield.coversSnapshot(active: true, memoryOnScreen: true))
        XCTAssertFalse(MemoryShield.coversSnapshot(active: false, memoryOnScreen: false))
    }
}
