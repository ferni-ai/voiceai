import Foundation
import XCTest
@testable import FerniKit

/// Nothing is said to Ferni before the signed-in person agrees; an agreement
/// never carries over to someone else on the same phone.
@MainActor
final class ConsentStoreTests: XCTestCase {
    private var suite = ""

    private func defaults() -> UserDefaults {
        suite = "consent-\(UUID().uuidString)"
        let d = UserDefaults(suiteName: suite)!
        d.removePersistentDomain(forName: suite)
        return d
    }

    func testAFreshInstallHasNotAgreed() {
        let store = ConsentStore(defaults: defaults())
        store.use(uid: "a")
        XCTAssertFalse(store.hasAgreed)
    }

    func testNoAccountCannotAgree() {
        let store = ConsentStore(defaults: defaults())
        XCTAssertFalse(store.agree())
        XCTAssertFalse(store.hasAgreed)
    }

    func testAgreeingIsRememberedForThatPersonAcrossLaunches() {
        let d = defaults()
        let at = Date(timeIntervalSince1970: 1_792_300_000)
        let store = ConsentStore(defaults: d)
        store.use(uid: "a")
        store.agree(now: at)

        let relaunched = ConsentStore(defaults: d)
        relaunched.use(uid: "a")
        XCTAssertTrue(relaunched.hasAgreed)
        XCTAssertEqual(relaunched.agreement, .init(uid: "a", version: ConsentStore.currentVersion, agreedAt: at))
    }

    func testSomeoneElseOnTheSamePhoneIsAskedAgain() {
        let store = ConsentStore(defaults: defaults())
        store.use(uid: "a")
        store.agree()

        store.use(uid: "b")
        XCTAssertFalse(store.hasAgreed, "A's agreement is not B's")
        XCTAssertNil(store.agreement, "B isn't shown A's agreement either")
        store.use(uid: nil)
        XCTAssertFalse(store.hasAgreed)
    }

    func testSigningOutForgetsTheAgreement() {
        let d = defaults()
        let store = ConsentStore(defaults: d)
        store.use(uid: "a")
        store.agree()

        store.forget(uid: "a") // sign-out or account deletion
        store.use(uid: "b")
        XCTAssertFalse(store.hasAgreed)
        store.use(uid: "a")
        XCTAssertFalse(store.hasAgreed, "A signing back in agrees again")
    }

    func testWithdrawingAsksAgain() {
        let store = ConsentStore(defaults: defaults())
        store.use(uid: "a")
        store.agree()
        store.withdraw()
        XCTAssertFalse(store.hasAgreed)
    }

    func testAgreementToOlderWordingAsksAgain() throws {
        let d = defaults()
        let old = ["a": ConsentStore.Agreement(uid: "a", version: "2025-01-01", agreedAt: .now)]
        d.set(try JSONEncoder().encode(old), forKey: "ferni.consent.processing.byUID")
        let store = ConsentStore(defaults: d)
        store.use(uid: "a")
        XCTAssertFalse(store.hasAgreed)
    }

    /// Belt and braces: an agreement filed under the wrong uid still doesn't count.
    func testAMisfiledAgreementDoesNotCount() throws {
        let d = defaults()
        let misfiled = ["b": ConsentStore.Agreement(uid: "a", version: ConsentStore.currentVersion, agreedAt: .now)]
        d.set(try JSONEncoder().encode(misfiled), forKey: "ferni.consent.processing.byUID")
        let store = ConsentStore(defaults: d)
        store.use(uid: "b")
        XCTAssertFalse(store.hasAgreed)
    }
}
