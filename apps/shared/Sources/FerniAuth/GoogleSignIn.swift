import AuthenticationServices
import CryptoKit
import Foundation

/// Google sign-in for native apps: OAuth authorization code + PKCE in an
/// ASWebAuthenticationSession, returning Google's ID token for Firebase.
/// The client ID is a public identifier (an iOS-type OAuth client, which Google
/// also uses for macOS); native clients have no secret.
@MainActor
public final class GoogleSignIn: NSObject, ASWebAuthenticationPresentationContextProviding {
    let clientID: String
    let transport: HTTPTransport
    let anchor: () -> ASPresentationAnchor

    public init(clientID: String, transport: HTTPTransport, anchor: @escaping () -> ASPresentationAnchor) {
        self.clientID = clientID
        self.transport = transport
        self.anchor = anchor
    }

    /// `com.googleusercontent.apps.<id>`: Google's redirect scheme for a native client.
    var redirectScheme: String {
        "com.googleusercontent.apps." + clientID.replacingOccurrences(of: ".apps.googleusercontent.com", with: "")
    }

    public func idToken() async throws -> String {
        let verifier = Self.randomURLSafe(bytes: 32)
        let state = Self.randomURLSafe(bytes: 16)
        let redirectURI = "\(redirectScheme):/oauth2redirect"
        var authorize = URLComponents(string: "https://accounts.google.com/o/oauth2/v2/auth")!
        authorize.queryItems = [
            URLQueryItem(name: "client_id", value: clientID),
            URLQueryItem(name: "redirect_uri", value: redirectURI),
            URLQueryItem(name: "response_type", value: "code"),
            URLQueryItem(name: "scope", value: "openid email profile"),
            URLQueryItem(name: "code_challenge", value: Self.challenge(for: verifier)),
            URLQueryItem(name: "code_challenge_method", value: "S256"),
            URLQueryItem(name: "state", value: state),
        ]
        let callback = try await present(authorize.url!)
        let items = URLComponents(url: callback, resolvingAgainstBaseURL: false)?.queryItems ?? []
        guard items.first(where: { $0.name == "state" })?.value == state,
              let code = items.first(where: { $0.name == "code" })?.value else { throw AuthError.malformedResponse }

        var exchange = URLRequest(url: URL(string: "https://oauth2.googleapis.com/token")!)
        exchange.httpMethod = "POST"
        exchange.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        var form = URLComponents()
        form.queryItems = [
            URLQueryItem(name: "grant_type", value: "authorization_code"),
            URLQueryItem(name: "code", value: code),
            URLQueryItem(name: "client_id", value: clientID),
            URLQueryItem(name: "redirect_uri", value: redirectURI),
            URLQueryItem(name: "code_verifier", value: verifier),
        ]
        exchange.httpBody = Data((form.percentEncodedQuery ?? "").utf8)
        let (data, response) = try await transport.send(exchange)
        guard response.statusCode == 200 else { throw AuthError.http(response.statusCode) }
        struct Body: Decodable { let id_token: String }
        guard let body = try? JSONDecoder().decode(Body.self, from: data) else { throw AuthError.malformedResponse }
        return body.id_token
    }

    private func present(_ url: URL) async throws -> URL {
        try await withCheckedThrowingContinuation { continuation in
            let session = ASWebAuthenticationSession(url: url, callbackURLScheme: redirectScheme) { callback, error in
                if let callback {
                    continuation.resume(returning: callback)
                } else if (error as? ASWebAuthenticationSessionError)?.code == .canceledLogin {
                    continuation.resume(throwing: AuthError.cancelled)
                } else {
                    continuation.resume(throwing: error ?? AuthError.malformedResponse)
                }
            }
            session.presentationContextProvider = self
            session.start()
        }
    }

    public func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        anchor()
    }

    /// RFC 7636 S256: base64url(SHA256(verifier)), unpadded.
    nonisolated static func challenge(for verifier: String) -> String {
        base64URL(Data(SHA256.hash(data: Data(verifier.utf8))))
    }

    nonisolated static func randomURLSafe(bytes count: Int) -> String {
        // SystemRandomNumberGenerator is the OS CSPRNG.
        base64URL(Data((0..<count).map { _ in UInt8.random(in: .min ... .max) }))
    }

    nonisolated private static func base64URL(_ data: Data) -> String {
        data.base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}
