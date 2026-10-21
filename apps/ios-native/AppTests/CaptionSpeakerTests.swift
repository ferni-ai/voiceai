import FerniDesign
import FerniVoice
import XCTest
@testable import Ferni

/// Design audit P1-3: after a handoff, Maya's captions looked exactly like
/// Ferni's. A run of lines from one teammate now starts with their name and
/// colour, once more than Ferni is in the call; a call with only Ferni stays
/// as it was. And the call's name waits for the teammate to take the stage.
@MainActor
final class CaptionSpeakerTests: XCTestCase {
    private func line(_ id: String, _ speaker: CaptionChunk.Speaker, _ persona: String?) -> Caption {
        Caption(id: id, speaker: speaker, text: id, isFinal: true, personaID: persona)
    }

    func testOnlyFerniHasNoNames() {
        let lines = [line("a", .you, nil), line("b", .ferni, "ferni"), line("c", .ferni, "ferni")]
        XCTAssertEqual(CallCaptions.labelled(lines), [])
    }

    func testAfterAHandoffEachRunIsNamed() {
        let lines = [line("a", .ferni, "ferni"), line("b", .you, nil), line("c", .ferni, "ferni"),
                     line("d", .ferni, "maya"), line("e", .you, nil), line("f", .ferni, "maya")]
        XCTAssertEqual(CallCaptions.labelled(lines), ["a", "d"], "Ferni's run, then Maya's")
    }

    /// Award upgrade 4: "Maya joined" is never a label itself, and her first
    /// words after it are still named.
    func testAJoinIsNotWordsAndHerWordsAreStillNamed() {
        var joined = line("j", .ferni, "maya")
        joined.joined = true
        let lines = [line("a", .ferni, "ferni"), joined, line("d", .ferni, "maya")]
        XCTAssertEqual(CallCaptions.labelled(lines), ["a", "d"])
    }

    func testATeammateAloneIsNamed() {
        XCTAssertEqual(CallCaptions.labelled([line("a", .ferni, "maya")]), ["a"])
    }

    /// The book tags Ferni's side with whoever has the call, and never the person.
    func testTheBookTagsWhoSaidIt() {
        var book = CaptionBook()
        book.apply(CaptionChunk(streamID: "s1", segmentID: "g1", speaker: .ferni, text: "Hi", isFinal: true), persona: "maya")
        book.apply(CaptionChunk(streamID: "s2", segmentID: "g2", speaker: .you, text: "Hey", isFinal: true), persona: "maya")
        XCTAssertEqual(book.lines.map(\.personaID), ["maya", nil])
    }

    /// The name changes when the teammate takes the middle, at the outgoing
    /// persona's tempo, not when the handoff is announced.
    func testTheNameWaitsForTheSwap() {
        XCTAssertEqual(AliveRig.handoffSeconds(from: .ferni), 2.15, accuracy: 1e-9)
        XCTAssertEqual(AliveRig.handoffSeconds(from: .jordan), 2.15 * 0.8, accuracy: 1e-9)
    }
}
