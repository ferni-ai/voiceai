import Foundation
import StoreKit
import XCTest
@testable import FerniVoice

/// Purchases must carry the server-issued appAccountToken, and never start without it.
@MainActor
final class SubscriptionAccountTokenTests: XCTestCase {

    // MARK: - Fakes

    private final class FakeAccountAPI: AppleAccountAPI, @unchecked Sendable {
        let token: Result<UUID, Error>
        private(set) var submitted: [String] = []

        init(token: Result<UUID, Error>) { self.token = token }

        func fetchAppAccountToken() async throws -> UUID { try token.get() }
        func submitSignedTransaction(_ jws: String) async throws { submitted.append(jws) }
    }

    /// Records the options StoreKit would get; the user "cancels" the sheet.
    private final class FakeProduct: PurchasableProduct, @unchecked Sendable {
        let id = ProductID.friendMonthly
        private(set) var purchaseCalls: [Set<Product.PurchaseOption>] = []

        func purchase(options: Set<Product.PurchaseOption>) async throws -> Product.PurchaseResult {
            purchaseCalls.append(options)
            return .userCancelled
        }
    }

    private struct Offline: Error {}

    // MARK: - SubscriptionService.purchase

    func testPurchasePassesTheFetchedAppAccountToken() async {
        let token = UUID(uuidString: "6f1c3d2e-9a4b-5c7d-8e0f-112233445566")!
        let service = SubscriptionService(accountAPI: FakeAccountAPI(token: .success(token)), observeStore: false)
        let product = FakeProduct()

        let result = await service.purchase(product)

        XCTAssertEqual(product.purchaseCalls.count, 1)
        XCTAssertEqual(product.purchaseCalls.first, [.appAccountToken(token)])
        guard case .cancelled = result else { return XCTFail("expected .cancelled, got \(result)") }
    }

    func testPurchaseIsNotStartedWhenTheTokenFetchFails() async {
        let service = SubscriptionService(accountAPI: FakeAccountAPI(token: .failure(Offline())), observeStore: false)
        let product = FakeProduct()

        let result = await service.purchase(product)

        XCTAssertTrue(product.purchaseCalls.isEmpty, "never buy without the token")
        guard case .failed(.accountUnavailable) = result else {
            return XCTFail("expected .failed(.accountUnavailable), got \(result)")
        }
        XCTAssertEqual(service.lastError, .accountUnavailable)
        XCTAssertNotNil(service.lastError?.errorDescription)
    }

    func testSignedOutCallerIsAskedToSignIn() async {
        let service = SubscriptionService(
            accountAPI: FakeAccountAPI(token: .failure(AppleAccountAPIError.notSignedIn)),
            observeStore: false
        )
        let product = FakeProduct()

        let result = await service.purchase(product)

        XCTAssertTrue(product.purchaseCalls.isEmpty)
        guard case .failed(.signInRequired) = result else {
            return XCTFail("expected .failed(.signInRequired), got \(result)")
        }
    }

    // MARK: - FerniAppleAccountAPI (the live client's requests)

    private final class Recorder: @unchecked Sendable {
        var requests: [URLRequest] = []
        var status = 200
        var body = Data()
    }

    private func liveAPI(_ recorder: Recorder, idToken: String? = "id-token-abc") -> FerniAppleAccountAPI {
        FerniAppleAccountAPI(
            baseURL: URL(string: "https://api.example.test")!,
            idToken: { idToken },
            send: { request in
                recorder.requests.append(request)
                let response = HTTPURLResponse(
                    url: request.url!, statusCode: recorder.status, httpVersion: nil, headerFields: nil
                )!
                return (recorder.body, response)
            }
        )
    }

    func testFetchAppAccountTokenCallsTheAuthenticatedEndpoint() async throws {
        let recorder = Recorder()
        // The server's exact response for uid "user-123" (appAccountTokenFor, a lowercase UUIDv5).
        recorder.body = Data(#"{"appAccountToken":"2fc12bde-1757-59f5-bb13-dd9d91f5e60a"}"#.utf8)

        let token = try await liveAPI(recorder).fetchAppAccountToken()

        XCTAssertEqual(token, UUID(uuidString: "2FC12BDE-1757-59F5-BB13-DD9D91F5E60A"))
        let request = try XCTUnwrap(recorder.requests.first)
        XCTAssertEqual(request.httpMethod, "GET")
        XCTAssertEqual(request.url?.path, "/api/apple/account-token")
        XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer id-token-abc")
    }

    func testFetchAppAccountTokenFailsWhenSignedOutOrRefused() async {
        let signedOut = Recorder()
        do {
            _ = try await liveAPI(signedOut, idToken: nil).fetchAppAccountToken()
            XCTFail("expected notSignedIn")
        } catch {
            XCTAssertEqual(error as? AppleAccountAPIError, .notSignedIn)
            XCTAssertTrue(signedOut.requests.isEmpty)
        }

        let refused = Recorder()
        refused.status = 401
        do {
            _ = try await liveAPI(refused).fetchAppAccountToken()
            XCTFail("expected badStatus")
        } catch {
            XCTAssertEqual(error as? AppleAccountAPIError, .badStatus(401))
        }
    }

    func testSubmitSendsOnlyTheSignedTransactionNoUserId() async throws {
        let recorder = Recorder()

        try await liveAPI(recorder).submitSignedTransaction("header.payload.signature")

        let request = try XCTUnwrap(recorder.requests.first)
        XCTAssertEqual(request.httpMethod, "POST")
        XCTAssertEqual(request.url?.path, "/api/apple/verify")
        XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer id-token-abc")
        let body = try XCTUnwrap(
            JSONSerialization.jsonObject(with: XCTUnwrap(request.httpBody)) as? [String: String]
        )
        XCTAssertEqual(body, ["receiptData": "header.payload.signature"])
    }
}
