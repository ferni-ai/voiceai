import XCTest
@testable import FerniVoice

/// Only the agent steers the call; anyone else in the room is ignored.
final class RoomTrustTests: XCTestCase {
    func testDataFromAnythingButTheAgentIsIgnored() {
        XCTAssertTrue(LiveKitVoiceRoom.trustsData(fromAgent: true))
        XCTAssertFalse(LiveKitVoiceRoom.trustsData(fromAgent: false), "another participant")
        XCTAssertFalse(LiveKitVoiceRoom.trustsData(fromAgent: nil), "no participant (server-sent)")
    }

    private func speaker(_ sender: String, track: String?) -> CaptionChunk.Speaker? {
        LiveKitVoiceRoom.captionSpeaker(
            sender: sender, transcribedTrack: track, local: "uid1", localTracks: ["TR_mic"], agents: ["agent-AJ_x"]
        )
    }

    func testFernisWordsAndOursAreAttributedByTheTranscribedTrack() {
        XCTAssertEqual(speaker("agent-AJ_x", track: "TR_agentvoice"), .ferni)
        XCTAssertEqual(speaker("uid1", track: "TR_mic"), .you, "our words, sent by the agent under our identity")
        XCTAssertEqual(speaker("agent-AJ_x", track: "TR_mic"), .you, "attribution follows the track, not the header")
        XCTAssertEqual(speaker("uid1", track: "TR_agentvoice"), .ferni)
    }

    func testAStreamFromAnyoneButFerniOrUsIsIgnored() {
        XCTAssertNil(speaker("stranger", track: "TR_mic"), "a non-agent claiming our track")
        XCTAssertNil(speaker("stranger", track: "TR_agentvoice"), "a non-agent posing as Ferni's voice")
        XCTAssertNil(speaker("stranger", track: nil))
    }

    func testWithoutATrackIdTheSenderDecides() {
        XCTAssertEqual(speaker("agent-AJ_x", track: nil), .ferni)
        XCTAssertEqual(speaker("uid1", track: nil), .you)
    }
}
