import Foundation

/// Why a server call didn't work, in terms a screen can act on.
public enum FerniAPIError: Error, Equatable, Sendable {
    /// No account to ask as (the sign-in hasn't finished, or failed).
    case notSignedIn
    /// The server answered with this status.
    case status(Int)
    /// The request never got an answer (offline, timed out).
    case unreachable
}

/// Calls the same JSON endpoints the web app uses, as the signed-in account:
/// every request carries `Authorization: Bearer <Firebase ID token>`.
///
/// A 401 means the token went stale between fetching and sending it, so the
/// call asks for a fresh token and tries exactly once more.
public struct FerniAPI: Sendable {
    public typealias Send = @Sendable (URLRequest) async throws -> (Data, URLResponse)
    /// The account's ID token; `true` forces a refresh from Firebase.
    public typealias IDToken = @Sendable (_ forceRefresh: Bool) async -> String?

    public let baseURL: URL
    private let idToken: IDToken
    private let send: Send

    public init(
        baseURL: URL,
        idToken: @escaping IDToken,
        send: @escaping Send = { try await URLSession.shared.data(for: $0) }
    ) {
        self.baseURL = baseURL
        self.idToken = idToken
        self.send = send
    }

    /// The response body of a 2xx answer.
    public func data(
        _ path: String,
        method: String = "GET",
        query: [URLQueryItem] = [],
        json body: (any Encodable & Sendable)? = nil,
        timeout: TimeInterval = 15
    ) async throws -> Data {
        guard let token = await idToken(false) else { throw FerniAPIError.notSignedIn }
        var request = try makeRequest(path, method: method, query: query, body: body, timeout: timeout)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        let (data, status) = try await perform(request)
        guard status == 401 else { return try accept(data, status) }

        guard let fresh = await idToken(true) else { throw FerniAPIError.notSignedIn }
        request.setValue("Bearer \(fresh)", forHTTPHeaderField: "Authorization")
        let (retryData, retryStatus) = try await perform(request)
        return try accept(retryData, retryStatus)
    }

    private func makeRequest(
        _ path: String, method: String, query: [URLQueryItem], body: (any Encodable & Sendable)?,
        timeout: TimeInterval
    ) throws -> URLRequest {
        var components = URLComponents(url: baseURL.appendingPathComponent(path), resolvingAgainstBaseURL: false)
        if !query.isEmpty { components?.queryItems = query }
        guard let url = components?.url else { throw FerniAPIError.status(400) }
        var request = URLRequest(url: url, timeoutInterval: timeout)
        request.httpMethod = method
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONEncoder().encode(body)
        }
        return request
    }

    private func perform(_ request: URLRequest) async throws -> (Data, Int) {
        do {
            let (data, response) = try await send(request)
            return (data, (response as? HTTPURLResponse)?.statusCode ?? 0)
        } catch is CancellationError {
            throw CancellationError()
        } catch {
            throw FerniAPIError.unreachable
        }
    }

    private func accept(_ data: Data, _ status: Int) throws -> Data {
        guard (200..<300).contains(status) else { throw FerniAPIError.status(status) }
        return data
    }
}
