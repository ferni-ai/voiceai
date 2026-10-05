//
//  AppleAccountAPI.swift
//  FerniVoice
//
//  The two server calls around an App Store purchase, made as the signed-in
//  user (Firebase Bearer token):
//  - GET /api/apple/account-token: the per-account UUID StoreKit stamps on the
//    purchase as appAccountToken. The server refuses a transaction whose token
//    belongs to someone else, so nobody can claim a purchase that isn't theirs.
//  - POST /api/apple/verify: the verified transaction's signed JWS. The server
//    binds it to the caller from the token; the body never names a user.
//

import Foundation
import StoreKit

protocol AppleAccountAPI: Sendable {
    /// The appAccountToken the server issued for the signed-in user.
    func fetchAppAccountToken() async throws -> UUID
    /// Send a StoreKit-verified transaction (its JWS) to the server.
    func submitSignedTransaction(_ jws: String) async throws
}

enum AppleAccountAPIError: Error, Equatable {
    case notSignedIn
    case badStatus(Int)
    case malformedToken
}

/// A product StoreKit can buy. `Product` conforms; tests use a fake.
protocol PurchasableProduct: Sendable {
    var id: String { get }
    func purchase(options: Set<Product.PurchaseOption>) async throws -> Product.PurchaseResult
}

extension Product: PurchasableProduct {}

enum AccountBoundPurchase {
    /// Purchase options carrying the caller's appAccountToken. Throws when the
    /// token can't be fetched: never buy without it.
    static func options(from api: AppleAccountAPI) async throws -> Set<Product.PurchaseOption> {
        let token = try await api.fetchAppAccountToken()
        return [.appAccountToken(token)]
    }
}

/// The live client, authenticated with the Firebase ID token.
struct FerniAppleAccountAPI: AppleAccountAPI {
    typealias Send = @Sendable (URLRequest) async throws -> (Data, URLResponse)

    let baseURL: URL
    let idToken: @Sendable () async -> String?
    let send: Send

    init(
        baseURL: URL = URL(string: "https://app.ferni.ai")!,
        idToken: @escaping @Sendable () async -> String? = { await AuthService.shared.getFirebaseToken() },
        send: @escaping Send = { try await URLSession.shared.data(for: $0) }
    ) {
        self.baseURL = baseURL
        self.idToken = idToken
        self.send = send
    }

    private struct TokenResponse: Decodable {
        let appAccountToken: String
    }

    func fetchAppAccountToken() async throws -> UUID {
        let request = try await authorizedRequest(path: "/api/apple/account-token", method: "GET")
        let data = try await perform(request)
        let decoded = try JSONDecoder().decode(TokenResponse.self, from: data)
        guard let token = UUID(uuidString: decoded.appAccountToken) else {
            throw AppleAccountAPIError.malformedToken
        }
        return token
    }

    func submitSignedTransaction(_ jws: String) async throws {
        var request = try await authorizedRequest(path: "/api/apple/verify", method: "POST")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        // No userId: the server attaches the purchase to the Bearer-token user.
        request.httpBody = try JSONEncoder().encode(["receiptData": jws])
        _ = try await perform(request)
    }

    private func authorizedRequest(path: String, method: String) async throws -> URLRequest {
        guard let token = await idToken() else { throw AppleAccountAPIError.notSignedIn }
        var request = URLRequest(url: baseURL.appendingPathComponent(path))
        request.httpMethod = method
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        return request
    }

    private func perform(_ request: URLRequest) async throws -> Data {
        let (data, response) = try await send(request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard status == 200 else { throw AppleAccountAPIError.badStatus(status) }
        return data
    }
}
