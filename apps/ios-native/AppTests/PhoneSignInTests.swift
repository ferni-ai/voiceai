import XCTest
@testable import Ferni

/// Critic H3: the server's word decides whether phone sign-in shows; without
/// it, a Debug build (this one) shows it and Release doesn't.
final class PhoneSignInTests: XCTestCase {
    func testTheServerDecidesWhenItSays() {
        XCTAssertTrue(PhoneSignIn.shown(remote: true))
        XCTAssertFalse(PhoneSignIn.shown(remote: false))
    }

    func testWithoutTheServerADebugBuildShowsIt() {
        XCTAssertTrue(PhoneSignIn.shown(remote: nil), "Debug; Release returns false (the #else branch)")
    }
}
