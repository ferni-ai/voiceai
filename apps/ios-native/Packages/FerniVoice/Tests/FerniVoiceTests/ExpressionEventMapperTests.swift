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

    func testOtherMessagesAreNotExpressions() {
        XCTAssertNil(mapper.processMessage(["type": "speech_state", "innerType": "speech_start"]))
        XCTAssertNil(mapper.processMessage(["expression": "warm"]))
    }
}
