import XCTest
@testable import FerniVoice

/// Only the agent steers the call; anyone else in the room is ignored.
final class RoomTrustTests: XCTestCase {
    func testDataFromAnythingButTheAgentIsIgnored() {
        XCTAssertTrue(LiveKitVoiceRoom.trustsData(fromAgent: true))
        XCTAssertFalse(LiveKitVoiceRoom.trustsData(fromAgent: false), "another participant")
        XCTAssertFalse(LiveKitVoiceRoom.trustsData(fromAgent: nil), "no participant (server-sent)")
    }

    func testCaptionsComeFromFerniOrAreOursAndNobodyElse() {
        let agents: Set<String> = ["agent-AJ_x"]
        XCTAssertEqual(LiveKitVoiceRoom.captionSpeaker(sender: "agent-AJ_x", local: "uid1", agents: agents), .ferni)
        XCTAssertEqual(LiveKitVoiceRoom.captionSpeaker(sender: "uid1", local: "uid1", agents: agents), .you)
        XCTAssertNil(LiveKitVoiceRoom.captionSpeaker(sender: "stranger", local: "uid1", agents: agents))
    }
}
