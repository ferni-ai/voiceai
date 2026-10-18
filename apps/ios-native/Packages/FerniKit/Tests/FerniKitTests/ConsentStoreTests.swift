import Foundation
import XCTest
@testable import FerniKit

/// Nothing is said to Ferni before you agree; withdrawing stops calls again.
@MainActor
final class ConsentStoreTests: XCTestCase {
    private func defaults() -> UserDefaults {
        let name = "consent-\(UUID().uuidString)"
        let d = UserDefaults(suiteName: name)!
        d.removePersistentDomain(forName: name)
        return d
    }

    func testAFreshInstallHasNotAgreed() {
        XCTAssertFalse(ConsentStore(defaults: defaults()).hasAgreed)
    }

    func testAgreeingIsRememberedAcrossLaunches() {
        let d = defaults()
        let at = Date(timeIntervalSince1970: 1_792_300_000)
        ConsentStore(defaults: d).agree(now: at)

        let relaunched = ConsentStore(defaults: d)
        XCTAssertTrue(relaunched.hasAgreed)
        XCTAssertEqual(relaunched.agreement, .init(version: ConsentStore.currentVersion, agreedAt: at))
    }

    func testWithdrawingAsksAgain() {
        let d = defaults()
        let store = ConsentStore(defaults: d)
        store.agree()
        store.withdraw()
        XCTAssertFalse(store.hasAgreed)
        XCTAssertFalse(ConsentStore(defaults: d).hasAgreed)
    }

    func testAgreementToOlderWordingAsksAgain() throws {
        let d = defaults()
        let old = ConsentStore.Agreement(version: "2025-01-01", agreedAt: .now)
        d.set(try JSONEncoder().encode(old), forKey: "ferni.consent.processing")
        XCTAssertFalse(ConsentStore(defaults: d).hasAgreed)
    }
}
