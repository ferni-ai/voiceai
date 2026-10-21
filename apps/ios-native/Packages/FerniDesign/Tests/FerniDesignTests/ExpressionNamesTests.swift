import XCTest
@testable import FerniDesign

/// Expression audit P1 #9: `glad` and `settling` were tokens no case reached,
/// and the web's older names (celebrating, noticing, holding…) silently
/// became neutral.
final class ExpressionNamesTests: XCTestCase {
    /// Every design-system token is a face the app can be asked for, by name.
    func testEveryTokenRoundTrips() {
        for id in ExpressionTokens.all.keys.sorted() {
            XCTAssertEqual(AvatarExpression.from(id).rawValue, id, "\(id) is reachable")
        }
        XCTAssertEqual(Set(AvatarExpression.allCases.map(\.rawValue)), Set(ExpressionTokens.all.keys), "one case per token")
    }

    func testTheWebsOlderNamesMeanItsFaces() {
        XCTAssertEqual(AvatarExpression.from("celebrating"), .joyful)
        XCTAssertEqual(AvatarExpression.from("noticing"), .attentive)
        XCTAssertEqual(AvatarExpression.from("holding"), .compassionate)
        XCTAssertEqual(AvatarExpression.from("waiting"), .attentive, "waiting on you, eyes open (critic L3)")
        for (name, face) in AvatarExpression.aliases {
            XCTAssertNotNil(ExpressionTokens.all[face.rawValue], "\(name) → \(face) is a token")
            XCTAssertNil(ExpressionTokens.all[name], "\(name) isn't a token itself")
        }
        XCTAssertEqual(AvatarExpression.from("not-a-face"), .neutral)
    }

    /// No older name puts Ferni to sleep: an alias never lands on a face with z's.
    func testNoAliasGivesZs() {
        for (name, face) in AvatarExpression.aliases {
            XCTAssertNotEqual(Face.glyphs[face.rawValue], "z", "\(name) → \(face) shows z's")
        }
    }
}
