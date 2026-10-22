import Foundation
import XCTest
@testable import FerniKit

/// Server calls go out as the signed-in account and survive a stale token.
final class FerniAPITests: XCTestCase {

    private final class Server: @unchecked Sendable {
        var statuses: [Int]
        var requests: [URLRequest] = []
        init(_ statuses: [Int]) { self.statuses = statuses }
        func send(_ request: URLRequest) -> (Data, URLResponse) {
            requests.append(request)
            let status = statuses.isEmpty ? 200 : statuses.removeFirst()
            return (Data("{}".utf8), HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!)
        }
    }

    private final class Tokens: @unchecked Sendable {
        var asked: [Bool] = []
        var value: String? = "t1"
    }

    private func api(_ server: Server, _ tokens: Tokens) -> FerniAPI {
        FerniAPI(
            baseURL: URL(string: "https://api.example.test")!,
            idToken: { force in
                tokens.asked.append(force)
                return force ? "t2" : tokens.value
            },
            send: { server.send($0) }
        )
    }

    func testRequestsCarryTheBearerToken() async throws {
        let server = Server([200])
        _ = try await api(server, Tokens()).data("/token", query: [URLQueryItem(name: "room", value: "r")])

        XCTAssertEqual(server.requests.first?.value(forHTTPHeaderField: "Authorization"), "Bearer t1")
        XCTAssertEqual(server.requests.first?.url?.absoluteString, "https://api.example.test/token?room=r")
    }

    func testAStaleTokenIsRefreshedOnceAndRetried() async throws {
        let server = Server([401, 200])
        let tokens = Tokens()
        _ = try await api(server, tokens).data("/token")

        XCTAssertEqual(tokens.asked, [false, true])
        XCTAssertEqual(server.requests.map { $0.value(forHTTPHeaderField: "Authorization") }, ["Bearer t1", "Bearer t2"])
    }

    func testRefusedTwiceIsA401NotALoop() async {
        let server = Server([401, 401])
        do {
            _ = try await api(server, Tokens()).data("/token")
            XCTFail("expected a 401")
        } catch {
            XCTAssertEqual(error as? FerniAPIError, .status(401))
        }
        XCTAssertEqual(server.requests.count, 2)
    }

    func testNoAccountMeansNoRequest() async {
        let server = Server([])
        let tokens = Tokens()
        tokens.value = nil
        do {
            _ = try await api(server, tokens).data("/token")
            XCTFail("expected notSignedIn")
        } catch {
            XCTAssertEqual(error as? FerniAPIError, .notSignedIn)
        }
        XCTAssertTrue(server.requests.isEmpty)
    }

    func testJSONBodyIsSentWithItsContentType() async throws {
        let server = Server([200])
        let upload = AppleAuthorizationUpload.uploader(api: api(server, Tokens()))
        try await upload("apple-code")

        let request = try XCTUnwrap(server.requests.first)
        XCTAssertEqual(request.httpMethod, "POST")
        XCTAssertEqual(request.url?.path, "/api/account/apple-authorization")
        XCTAssertEqual(request.value(forHTTPHeaderField: "Content-Type"), "application/json")
        let body = try JSONSerialization.jsonObject(with: try XCTUnwrap(request.httpBody)) as? [String: String]
        XCTAssertEqual(body, ["authorizationCode": "apple-code", "client": "native"])
    }
}
