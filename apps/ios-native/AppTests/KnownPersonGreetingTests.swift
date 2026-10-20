import XCTest
@testable import Ferni

/// Design audit P2 #11: signed out, Home said "Hi, I'm Ferni." to someone
/// whose account was on this phone (signing out forgets that they've talked).
@MainActor
final class KnownPersonGreetingTests: XCTestCase {
    func testSomeoneSignedOutIsWelcomedBackNotIntroduced() {
        let known = RestingWords.words(home: nil, ended: false, hour: 15, hasTalked: false, knownHere: true)
        XCTAssertEqual(known.headline, "Welcome back.")
        XCTAssertNotEqual(known.headline, Greeting.headline(hour: 15, firstVisit: true))
    }

    func testANewPersonIsStillIntroduced() {
        XCTAssertEqual(RestingWords.words(home: nil, ended: false, hour: 15, hasTalked: false).headline, "Hi, I'm Ferni.")
    }

    /// Once signed in, the server's answer decides, as before; the goodbye and a
    /// chosen teammate still come first.
    func testTheServerAndTheCallStillComeFirst() {
        XCTAssertEqual(RestingWords.words(home: nil, ended: true, hour: 15, hasTalked: false, knownHere: true).headline, "Talk soon.")
        XCTAssertEqual(RestingWords.words(home: nil, ended: false, hour: 15, hasTalked: false, chosen: "maya", knownHere: true).headline, "Maya's here.")
    }

    func testTheSignInLinePicksUpRatherThanStarts() {
        XCTAssertFalse(SignInPrompt.askText.contains("remembers you"))
        XCTAssertTrue(SignInPrompt.askText.contains("pick up where we left off"))
    }
}
