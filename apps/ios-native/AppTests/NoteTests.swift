import FerniKit
import XCTest
@testable import Ferni

/// Ferni's note on Home and the call it starts (docs/api/from-note.md).
@MainActor
final class NoteTests: XCTestCase {
    private let note = HomeLineStore.Home.Note(id: "6e0d15668ef07049", text: "your sister moving to Denver", createdAt: nil)

    private func model() -> AppModel {
        let model = AppModel(config: .production, firebaseReady: false)
        model.consent.use(uid: nil)
        return model
    }

    func testTheNoteIsFernisThought() {
        XCTAssertEqual(NoteWords.line(note), "I've been thinking about your sister moving to Denver.")
    }

    /// Talk about this goes through consent like every door, and the call it
    /// starts is the note's.
    func testTalkingAboutTheNoteCarriesItThroughConsent() {
        let model = model()
        model.talk(aboutNote: note)
        XCTAssertTrue(model.isAskingConsent)
        XCTAssertEqual(model.callOrigin, "note:6e0d15668ef07049")
    }

    /// Not now, or the call being over: the next ordinary Talk is ordinary.
    func testTheNoteDoesNotLeakIntoTheNextCall() {
        let model = model()
        model.talk(aboutNote: note)
        model.notNow()
        XCTAssertNil(model.callOrigin, "declined")
        model.talk(aboutNote: note)
        model.callFinished()
        XCTAssertNil(model.callOrigin, "finished")
    }
}
