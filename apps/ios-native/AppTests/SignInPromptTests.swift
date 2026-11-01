import FerniKit
import XCTest
@testable import Ferni

/// When Home offers signing in (P0 2026-10-19).
final class SignInPromptTests: XCTestCase {
    func testWhenHomeOffersSignIn() {
        XCTAssertEqual(SignInPrompt.shown(.needsSignIn), .ask)
        XCTAssertEqual(SignInPrompt.shown(.signedIn(AccountUser(uid: "a", isAnonymous: true))), .offer)
        XCTAssertNil(SignInPrompt.shown(.signedIn(AccountUser(uid: "r", isAnonymous: false, providerIDs: ["phone"]))))
        XCTAssertNil(SignInPrompt.shown(.starting))
        XCTAssertNil(SignInPrompt.shown(.unavailable("offline")))
    }
}
