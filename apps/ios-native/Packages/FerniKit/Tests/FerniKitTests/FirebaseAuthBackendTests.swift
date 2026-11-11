import FirebaseAuth
import Foundation
import XCTest
@testable import FerniKit

/// Firebase's sign-in errors, as the few a person can act on.
final class FirebaseAuthBackendTests: XCTestCase {
    private func mapped(_ code: AuthErrorCode) -> Error {
        FirebaseAuthBackend.signInError(NSError(domain: AuthErrorDomain, code: code.rawValue))
    }

    func testFirebaseErrorsBecomeOnesAPersonCanActOn() {
        let expected: [(AuthErrorCode, SignInError)] = [
            (.invalidPhoneNumber, .invalidPhoneNumber), (.missingPhoneNumber, .invalidPhoneNumber),
            (.invalidVerificationCode, .invalidCode), (.missingVerificationCode, .invalidCode),
            (.sessionExpired, .invalidCode),
            (.tooManyRequests, .tooManyAttempts), (.quotaExceeded, .tooManyAttempts),
            (.webContextCancelled, .cancelled),
        ]
        for (code, error) in expected {
            XCTAssertEqual(mapped(code) as? SignInError, error, "\(code)")
        }
        XCTAssertNil(SignInError.cancelled.message, "a cancel says nothing")
    }

    /// Anything else passes through unchanged; AccountStore shows it as "That didn't go through".
    func testOtherErrorsPassThrough() {
        let network = mapped(.networkError) as NSError
        XCTAssertEqual(network.domain, AuthErrorDomain)
        XCTAssertEqual(network.code, AuthErrorCode.networkError.rawValue)
        XCTAssertTrue(FirebaseAuthBackend.signInError(URLError(.timedOut)) is URLError)
    }
}
