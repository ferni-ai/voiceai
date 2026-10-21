import Foundation
import XCTest
@testable import FerniKit

/// Critic L4: every failed request read as "offline". Only connectivity
/// errors are unreachable; a cancelled request is silent; a certificate or
/// any other failure is generic.
final class FerniAPIErrorTests: XCTestCase {
    private func outcome(_ error: Error) async -> Error? {
        let api = FerniAPI(baseURL: URL(string: "https://api.example.test")!, idToken: { _ in "t" }) { _ in throw error }
        do {
            _ = try await api.data("/anything")
            return nil
        } catch {
            return error
        }
    }

    func testConnectivityErrorsAreUnreachable() async {
        // A failed TLS handshake (a captive portal, a weak signal) too (critic round 2, L4).
        for code in [URLError.Code.notConnectedToInternet, .timedOut, .networkConnectionLost, .cannotFindHost, .secureConnectionFailed] {
            let error = await outcome(URLError(code))
            XCTAssertEqual(error as? FerniAPIError, .unreachable, "\(code)")
        }
    }

    func testACancelledRequestIsSilent() async {
        let error = await outcome(URLError(.cancelled))
        XCTAssertTrue(error is CancellationError, "-999 is a cancellation, not offline: \(String(describing: error))")
    }

    func testCertificateAndOtherErrorsAreGeneric() async {
        for error in [URLError(.serverCertificateUntrusted), URLError(.serverCertificateHasBadDate),
                      URLError(.badURL)] as [Error] {
            let result = await outcome(error)
            XCTAssertEqual(result as? FerniAPIError, .failed, "\(error)")
        }
        let other = await outcome(NSError(domain: "x", code: 1))
        XCTAssertEqual(other as? FerniAPIError, .failed)
    }
}
