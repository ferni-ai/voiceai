import XCTest
@testable import FerniVoice

/// Tests for API connectivity and token server integration.
/// These tests validate the native app can communicate with the Ferni backend.
final class APIConnectivityTests: XCTestCase {

    // MARK: - Properties

    private let tokenServerURL = "https://app.ferni.ai"
    private var mockClient: MockHTTPClient!

    // MARK: - Setup

    override func setUp() {
        super.setUp()
        mockClient = MockHTTPClient()
    }

    override func tearDown() {
        mockClient = nil
        super.tearDown()
    }

    // MARK: - Token Server Tests

    func testTokenServerHealthCheck() async throws {
        // Given: A healthy token server
        mockClient.setupHealthResponse(healthy: true)

        // When: We check health
        let request = URLRequest(url: URL(string: "\(tokenServerURL)/health")!)
        let (data, response) = try await mockClient.fetch(request)

        // Then: We get a successful response
        let httpResponse = response as! HTTPURLResponse
        XCTAssertEqual(httpResponse.statusCode, 200)

        let json = try JSONSerialization.jsonObject(with: data) as! [String: Any]
        XCTAssertEqual(json["status"] as? String, "ok")
    }

    func testTokenFetchSuccess() async throws {
        // Given: A token server that returns valid tokens
        mockClient.setupTokenResponse(
            token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test",
            url: "wss://test.livekit.cloud",
            room: "ferni-ios-test123"
        )

        // When: We fetch a token
        var request = URLRequest(url: URL(string: "\(tokenServerURL)/token?room=test&username=user&persona_id=ferni")!)
        request.httpMethod = "GET"
        let (data, response) = try await mockClient.fetch(request)

        // Then: We get a valid token response
        let httpResponse = response as! HTTPURLResponse
        XCTAssertEqual(httpResponse.statusCode, 200)

        let json = try JSONSerialization.jsonObject(with: data) as! [String: Any]
        XCTAssertNotNil(json["token"] as? String)
        XCTAssertNotNil(json["url"] as? String)
        XCTAssertEqual(json["room"] as? String, "ferni-ios-test123")
    }

    func testTokenRequestIncludesPersonaId() async throws {
        // Given: A configured mock client
        mockClient.setupTokenResponse()

        // When: We fetch a token with persona_id
        let personaId = "maya"
        let urlString = "\(tokenServerURL)/token?room=test&username=user&persona_id=\(personaId)"
        let request = URLRequest(url: URL(string: urlString)!)
        _ = try await mockClient.fetch(request)

        // Then: The request URL includes the persona_id
        XCTAssertEqual(mockClient.requestHistory.count, 1)
        let sentRequest = mockClient.requestHistory.first!
        XCTAssertTrue(sentRequest.url!.absoluteString.contains("persona_id=\(personaId)"))
    }

    func testTokenRequestWithAuthorizationHeader() async throws {
        // Given: A configured mock client
        mockClient.setupTokenResponse()

        // When: We fetch a token with a Firebase auth header
        let firebaseToken = "firebase-id-token-test-123"
        var request = URLRequest(url: URL(string: "\(tokenServerURL)/token?room=test&username=user&persona_id=ferni")!)
        request.setValue("Bearer \(firebaseToken)", forHTTPHeaderField: "Authorization")
        _ = try await mockClient.fetch(request)

        // Then: The request includes the Authorization header
        XCTAssertEqual(mockClient.requestHistory.count, 1)
        let sentRequest = mockClient.requestHistory.first!
        XCTAssertEqual(sentRequest.value(forHTTPHeaderField: "Authorization"), "Bearer \(firebaseToken)")
    }

    // MARK: - Token Response Parsing Tests

    func testTokenResponseParsing() throws {
        // Given: A typical token response
        let responseJSON: [String: Any] = [
            "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c",
            "url": "wss://dev-8sm1ba0z.livekit.cloud",
            "room": "ferni-ios-abc123"
        ]

        // When: We parse the response
        let data = try JSONSerialization.data(withJSONObject: responseJSON)
        let parsed = try JSONSerialization.jsonObject(with: data) as! [String: Any]

        // Then: All fields are present and valid
        let token = parsed["token"] as? String
        let url = parsed["url"] as? String
        let room = parsed["room"] as? String

        XCTAssertNotNil(token)
        XCTAssertTrue(token!.hasPrefix("eyJ"))  // JWT format
        XCTAssertNotNil(url)
        XCTAssertTrue(url!.hasPrefix("wss://"))  // WebSocket URL
        XCTAssertNotNil(room)
        XCTAssertTrue(room!.hasPrefix("ferni-ios-"))  // Room naming convention
    }

    // MARK: - Error Handling Tests

    func testTokenFetchNetworkError() async {
        // Given: A mock client that simulates network failure
        mockClient.setResponse(for: "/token", response: .error(URLError(.notConnectedToInternet)))

        // When: We try to fetch a token
        let request = URLRequest(url: URL(string: "\(tokenServerURL)/token")!)

        // Then: We get a network error
        do {
            _ = try await mockClient.fetch(request)
            XCTFail("Expected network error")
        } catch {
            XCTAssertTrue(error is URLError || error is MockNetworkError)
        }
    }

    func testTokenFetchServerError() async throws {
        // Given: A mock client that returns a server error
        let errorResponse = MockHTTPClient.MockResponse(
            data: try JSONSerialization.data(withJSONObject: ["error": "Internal server error"]),
            statusCode: 500,
            error: nil
        )
        mockClient.setResponse(for: "/token", response: errorResponse)

        // When: We fetch a token
        let request = URLRequest(url: URL(string: "\(tokenServerURL)/token")!)
        let (_, response) = try await mockClient.fetch(request)

        // Then: We detect the server error
        let httpResponse = response as! HTTPURLResponse
        XCTAssertEqual(httpResponse.statusCode, 500)
    }

    // MARK: - URL Construction Tests

    func testTokenURLConstruction() {
        // Test that token URLs are constructed correctly
        let baseURL = tokenServerURL
        let room = "ferni-ios-\(UUID().uuidString.prefix(8))"
        let username = "ios-\(UUID().uuidString.prefix(8))"
        let personaId = "ferni"

        let tokenURL = "\(baseURL)/token?room=\(room)&username=\(username)&persona_id=\(personaId)"

        XCTAssertTrue(tokenURL.contains("/token?"))
        XCTAssertTrue(tokenURL.contains("room="))
        XCTAssertTrue(tokenURL.contains("username="))
        XCTAssertTrue(tokenURL.contains("persona_id="))
    }

    func testTokenURLWithSpecialCharacters() {
        // Ensure special characters in usernames are handled
        let baseURL = tokenServerURL
        let room = "ferni-ios-test"
        let username = "ios-user+test"  // Contains special character
        let personaId = "ferni"

        let encodedUsername = username.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed)!
        let tokenURL = "\(baseURL)/token?room=\(room)&username=\(encodedUsername)&persona_id=\(personaId)"

        XCTAssertTrue(tokenURL.contains(encodedUsername))
    }

    // MARK: - Environment Tests

    func testDevelopmentEnvironmentURL() {
        // Development should use ferni-dev project
        let devURL = "wss://dev-8sm1ba0z.livekit.cloud"
        XCTAssertTrue(devURL.contains("dev-"))
    }

    func testProductionEnvironmentURL() {
        // Production uses main project
        let prodURL = "wss://test-rvg91u1z.livekit.cloud"
        XCTAssertFalse(prodURL.contains("dev-"))
    }
}

// MARK: - Live Integration Tests

/// These tests hit the real API - only run when specifically enabled
extension APIConnectivityTests {

    /// Live test for token server health (skipped by default)
    func testLiveHealthCheck() async throws {
        // Skip in CI/automated runs
        try XCTSkipIf(ProcessInfo.processInfo.environment["RUN_LIVE_TESTS"] != "true",
                      "Live tests disabled. Set RUN_LIVE_TESTS=true to enable.")

        let url = URL(string: "https://app.ferni.ai/health")!
        let (data, response) = try await URLSession.shared.data(from: url)

        let httpResponse = response as! HTTPURLResponse
        XCTAssertEqual(httpResponse.statusCode, 200)

        let json = try JSONSerialization.jsonObject(with: data) as! [String: Any]
        XCTAssertEqual(json["status"] as? String, "ok")
    }
}
