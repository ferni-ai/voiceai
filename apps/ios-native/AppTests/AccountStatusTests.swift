import FerniKit
import XCTest
@testable import Ferni

/// Critic L6: Settings' Account never spins forever, and when the account
/// can't be set up there's a way to get help.
final class AccountStatusTests: XCTestCase {
    func testSetUpShowsWorkThenSaysItsSlow() {
        XCTAssertEqual(AccountStatus.shown(.starting, waited: 2), .working)
        XCTAssertEqual(AccountStatus.shown(.starting, waited: 15), .slow, "no endless spinner")
    }

    func testWhenItCantBeSetUpThereIsHelp() {
        XCTAssertEqual(AccountStatus.shown(.unavailable("Ferni can't reach your account right now."), waited: 0),
                       .unavailable("Ferni can't reach your account right now."))
        XCTAssertTrue(AccountStatus.shown(.unavailable("x"), waited: 0).offersHelp)
        XCTAssertTrue(AccountStatus.shown(.starting, waited: 20).offersHelp)
        XCTAssertFalse(AccountStatus.shown(.starting, waited: 1).offersHelp)
        XCTAssertEqual(AccountStatus.helpURL.absoluteString, "https://ferni.ai/help/")
    }
}
