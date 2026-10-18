import Foundation
import XCTest
@testable import FerniKit

/// The server's own contract: DELETE /api/account with the confirmation word
/// (src/api/account-routes.ts), as the signed-in account.
final class AccountDeletionTests: XCTestCase {
    private final class Server: @unchecked Sendable {
        var status = 200
        var request: URLRequest?
    }

    private func api(_ server: Server) -> FerniAPI {
        FerniAPI(baseURL: URL(string: "https://app.example.test")!, idToken: { _ in "id-token" }, send: { request in
            server.request = request
            return (Data(), HTTPURLResponse(url: request.url!, statusCode: server.status, httpVersion: nil, headerFields: nil)!)
        })
    }

    func testDeletingSendsTheConfirmationAsTheAccount() async throws {
        let server = Server()
        try await AccountDeletion.delete(using: api(server))
        let request = try XCTUnwrap(server.request)
        XCTAssertEqual(request.httpMethod, "DELETE")
        XCTAssertEqual(request.url?.path, "/api/account")
        XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer id-token")
        let body = try JSONSerialization.jsonObject(with: try XCTUnwrap(request.httpBody)) as? [String: String]
        XCTAssertEqual(body, ["confirmation": "DELETE_MY_ACCOUNT"])
    }

    func testARefusalIsAnErrorNotASilentSuccess() async {
        let server = Server()
        server.status = 500
        do {
            try await AccountDeletion.delete(using: api(server))
            XCTFail("expected an error")
        } catch {
            XCTAssertEqual(error as? FerniAPIError, .status(500))
        }
    }
}
