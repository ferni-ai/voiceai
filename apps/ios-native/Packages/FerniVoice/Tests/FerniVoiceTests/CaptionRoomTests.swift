import XCTest
@testable import FerniVoice

/// Critic L2: a caption keeps the room it was heard in, so a report about a
/// line from before a rejoin goes to that room's session, not the new one.
final class CaptionRoomTests: XCTestCase {
    private func chunk(_ segment: String, _ text: String, stream: String = "s") -> CaptionChunk {
        CaptionChunk(streamID: stream, segmentID: segment, speaker: .ferni, text: text, isFinal: false)
    }

    func testEachLineRemembersItsRoom() {
        var book = CaptionBook()
        book.apply(chunk("1", "Hello"), room: "ios-first")
        book.apply(chunk("2", "Still here"), room: "ios-second")
        XCTAssertEqual(book.lines.map(\.room), ["ios-first", "ios-second"])
    }

    func testMoreWordsDontMoveALine() {
        var book = CaptionBook()
        book.apply(chunk("1", "Hel"), room: "ios-first")
        book.apply(chunk("1", "lo"), room: "ios-second")
        XCTAssertEqual(book.lines.first?.text, "Hello")
        XCTAssertEqual(book.lines.first?.room, "ios-first")
    }
}
