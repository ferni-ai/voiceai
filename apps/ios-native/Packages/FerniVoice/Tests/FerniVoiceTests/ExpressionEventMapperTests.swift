import FerniDesign
import XCTest
@testable import FerniVoice

/// The agent's expression messages (apps/web/src/app/data-message-handlers.ts
/// handles the same types) become avatar faces.
final class ExpressionEventMapperTests: XCTestCase {
    private let mapper = ExpressionEventMapper.shared

    func testExpressionUpdateSetsThatFaceWithItsTiming() throws {
        let result = try XCTUnwrap(mapper.processMessage(
            ["type": "expression_update", "expression": "warm", "duration": 1500, "hold": 500]
        ))
        XCTAssertEqual(result.expression, .warm)
        XCTAssertEqual(result.duration ?? 0, 1.5, accuracy: 0.001)
        XCTAssertEqual(result.hold ?? 0, 0.5, accuracy: 0.001)
    }

    func testUnknownFaceNameIsNeutralNotDropped() throws {
        let result = try XCTUnwrap(mapper.processMessage(["type": "expression_update", "expression": "zany"]))
        XCTAssertEqual(result.expression, .neutral)
    }

    func testCrisisConcernComforts() throws {
        let result = try XCTUnwrap(mapper.processMessage(
            ["type": "humanization_signal", "signalType": "concern_detected", "concernLevel": "crisis"]
        ))
        XCTAssertEqual(result.expression, .comforting)
        XCTAssertEqual(result.microExpression, .protective)
    }

    /// A signal that plays a moment doesn't also pick a face that plays the
    /// big win: high engagement sent excited with its small win, so the spin
    /// played over it (expression audit P1 #13).
    func testASignalPlaysOneCelebration() throws {
        let types = ["concern_detected", "voice_state_detected", "emotional_trajectory", "high_engagement",
                     "disengagement", "vulnerability", "breakthrough"]
        for type in types {
            guard let result = mapper.processMessage(["type": "humanization_signal", "signalType": type]),
                  let moment = result.moment else { continue }
            XCTAssertFalse(AvatarView.wins.contains(result.expression),
                           "\(type) plays \(moment) and \(result.expression), which plays the big win too")
        }
        let engaged = try XCTUnwrap(mapper.processMessage(["type": "humanization_signal", "signalType": "high_engagement"]))
        XCTAssertEqual(engaged.moment, "celebration_small")
        XCTAssertEqual(engaged.expression, .happy)
    }

    func testOtherMessagesAreNotExpressions() {
        XCTAssertNil(mapper.processMessage(["type": "speech_state", "innerType": "speech_start"]))
        XCTAssertNil(mapper.processMessage(["expression": "warm"]))
    }
}
