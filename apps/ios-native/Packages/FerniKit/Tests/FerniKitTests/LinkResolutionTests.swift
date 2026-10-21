import FirebaseAuth
import Foundation
import XCTest
@testable import FerniKit

/// Linking a sign-in to this phone's anonymous account, when the credential
/// already has a Ferni account (a returning Apple user): sign in as that person,
/// never fail. Before this seam the branch was untested, and making it rethrow
/// kept FerniKitTests green.
final class LinkResolutionTests: XCTestCase {
    private func inUse(updated: String?) -> NSError {
        NSError(domain: AuthErrorDomain, code: AuthErrorCode.credentialAlreadyInUse.rawValue,
                userInfo: updated.map { [AuthErrorUserInfoUpdatedCredentialKey: $0] } ?? [:])
    }

    private func resolved(_ error: Error) -> String? {
        guard case .switchTo(let credential) = FirebaseAuthBackend.resolveLink(error: error, original: "original") else { return nil }
        return credential
    }

    func testAnAccountAlreadyThereSwitchesToItWithTheFreshCredential() {
        XCTAssertEqual(resolved(inUse(updated: "fresh")), "fresh", "Apple's nonce is single use: the fresh one, not the original")
    }

    func testWithoutAFreshCredentialItSwitchesWithTheOriginal() {
        XCTAssertEqual(resolved(inUse(updated: nil)), "original")
    }

    func testAnyOtherErrorIsRethrown() {
        XCTAssertNil(resolved(NSError(domain: AuthErrorDomain, code: AuthErrorCode.networkError.rawValue)), "a plain Firebase error")
        XCTAssertNil(resolved(URLError(.notConnectedToInternet)), "not a Firebase error")
        XCTAssertNil(resolved(NSError(domain: "SomeOtherDomain", code: AuthErrorCode.credentialAlreadyInUse.rawValue)),
                     "the same number in another domain")
    }
}
