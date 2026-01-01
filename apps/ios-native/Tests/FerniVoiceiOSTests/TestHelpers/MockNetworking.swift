import Foundation
@testable import FerniVoice

// MARK: - Mock HTTP Client

/// Protocol for network requests to enable mocking
protocol HTTPClientProtocol {
    func fetch(_ request: URLRequest) async throws -> (Data, URLResponse)
}

/// Production HTTP client using URLSession
struct ProductionHTTPClient: HTTPClientProtocol {
    func fetch(_ request: URLRequest) async throws -> (Data, URLResponse) {
        return try await URLSession.shared.data(for: request)
    }
}

/// Mock HTTP client for testing
final class MockHTTPClient: HTTPClientProtocol {
    var responses: [String: MockResponse] = [:]
    var requestHistory: [URLRequest] = []

    struct MockResponse {
        let data: Data
        let statusCode: Int
        let error: Error?

        static func success(_ json: [String: Any], statusCode: Int = 200) -> MockResponse {
            let data = try! JSONSerialization.data(withJSONObject: json)
            return MockResponse(data: data, statusCode: statusCode, error: nil)
        }

        static func error(_ error: Error) -> MockResponse {
            return MockResponse(data: Data(), statusCode: 500, error: error)
        }
    }

    func setResponse(for path: String, response: MockResponse) {
        responses[path] = response
    }

    func fetch(_ request: URLRequest) async throws -> (Data, URLResponse) {
        requestHistory.append(request)

        let path = request.url?.path ?? ""
        guard let mock = responses[path] else {
            throw MockNetworkError.noMockResponse(path: path)
        }

        if let error = mock.error {
            throw error
        }

        let response = HTTPURLResponse(
            url: request.url!,
            statusCode: mock.statusCode,
            httpVersion: nil,
            headerFields: nil
        )!

        return (mock.data, response)
    }
}

enum MockNetworkError: Error {
    case noMockResponse(path: String)
}

// MARK: - Test Token Responses

extension MockHTTPClient {
    /// Sets up standard token server response
    func setupTokenResponse(
        token: String = "test-token-abc123",
        url: String = "wss://test.livekit.cloud",
        room: String = "test-room"
    ) {
        let response = MockResponse.success([
            "token": token,
            "url": url,
            "room": room
        ])
        setResponse(for: "/token", response: response)
    }

    /// Sets up health check response
    func setupHealthResponse(healthy: Bool = true) {
        if healthy {
            let response = MockResponse.success([
                "status": "ok",
                "timestamp": Date().timeIntervalSince1970 * 1000
            ])
            setResponse(for: "/health", response: response)
        } else {
            let response = MockResponse.error(MockNetworkError.noMockResponse(path: "/health"))
            setResponse(for: "/health", response: response)
        }
    }
}
