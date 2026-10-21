import Foundation
import StoreKit
import XCTest
@testable import FerniKit

/// Tapping a teammate who isn't on the team yet introduces them, and joining
/// from there buys only with the server's account token.
@MainActor
final class PlanPurchaseTests: XCTestCase {

    // MARK: - Fakes (external services only: the server API and StoreKit)

    private final class AccountAPI: AppleAccountAPI, @unchecked Sendable {
        let token: Result<UUID, Error>
        private(set) var tokenFetches = 0
        init(_ token: Result<UUID, Error>) { self.token = token }
        func fetchAppAccountToken() async throws -> UUID {
            tokenFetches += 1
            return try token.get()
        }
        func submitSignedTransaction(_ jws: String) async throws {}
    }

    /// Records what StoreKit would be asked; the person closes the App Store sheet.
    private final class StoreProduct: PurchasableProduct, @unchecked Sendable {
        let id = ProductID.friendMonthly
        private(set) var purchaseCalls: [Set<Product.PurchaseOption>] = []
        func purchase(options: Set<Product.PurchaseOption>) async throws -> Product.PurchaseResult {
            purchaseCalls.append(options)
            return .userCancelled
        }
    }

    private struct Offline: Error {}

    private func model(
        _ api: AppleAccountAPI,
        product: StoreProduct?,
        askedFor: @escaping (SubscriptionTier) -> Void = { _ in }
    ) -> PlanPurchaseModel {
        PlanPurchaseModel(
            service: SubscriptionService(accountAPI: api, observeStore: false),
            productFor: { tier in
                askedFor(tier)
                return product
            }
        )
    }

    // MARK: - The tap

    func testTappingATeammateNotOnTheTeamOpensTheirIntroduction() {
        let team = TeamUnlock.evaluate(stage: .firstMeeting, stageProgress: 0, plan: .free).unlocked

        XCTAssertEqual(TeamUnlock.cardTap(personaId: "maya", team: team), .meet("maya"))
        XCTAssertEqual(TeamUnlock.cardTap(personaId: "nayan", team: team), .meet("nayan"))
        XCTAssertEqual(TeamUnlock.cardTap(personaId: "ferni", team: team), .talk("ferni"))
    }

    func testOnceTheyJoinTheTapStartsTheConversation() {
        let team = TeamUnlock.evaluate(stage: .firstMeeting, stageProgress: 0, plan: .friend).unlocked

        XCTAssertEqual(TeamUnlock.cardTap(personaId: "maya", team: team), .talk("maya"))
        XCTAssertEqual(TeamUnlock.cardTap(personaId: "nayan", team: team), .meet("nayan"))
    }

    func testEveryTeammateWhoCanBeLockedHasAnIntroductionAndAPlan() {
        for persona in PersonaRegistry.all where persona.id != PersonaRegistry.ferni.id {
            XCTAssertNotNil(TeammateIntroduction.forPersona(persona.id), "no introduction for \(persona.id)")
            XCTAssertNotNil(SubscriptionTier.plan(including: persona.id), "no plan brings in \(persona.id)")
        }
        XCTAssertEqual(SubscriptionTier.plan(including: "maya"), .friend)
        XCTAssertEqual(SubscriptionTier.plan(including: "nayan"), .partner)
        XCTAssertNil(SubscriptionTier.plan(including: "ferni"), "Ferni is always here")
    }

    // MARK: - Joining

    func testJoiningBuysTheTeammatesPlanWithTheServerToken() async {
        let token = UUID(uuidString: "2fc12bde-1757-59f5-bb13-dd9d91f5e60a")!
        let product = StoreProduct()
        var asked: [SubscriptionTier] = []
        let model = model(AccountAPI(.success(token)), product: product, askedFor: { asked.append($0) })

        await model.join(SubscriptionTier.plan(including: "peter")!)

        XCTAssertEqual(asked, [.friend])
        XCTAssertEqual(product.purchaseCalls, [[.appAccountToken(token)]])
        XCTAssertEqual(model.phase, .idle, "closing the App Store sheet just goes back")
    }

    func testNoTokenNoPurchase() async {
        let api = AccountAPI(.failure(Offline()))
        let product = StoreProduct()
        let model = model(api, product: product)

        await model.join(.friend)

        XCTAssertEqual(api.tokenFetches, 1)
        XCTAssertTrue(product.purchaseCalls.isEmpty, "never buy without the token")
        XCTAssertEqual(model.phase, .notice("Couldn't start that right now. Try again?"))
    }

    /// The server answers 503 while it can't verify purchases (e.g. APPLE_APP_APPLE_ID
    /// unset). Body is the route's real response: src/api/apple-iap-routes.ts getAccountToken.
    func testServerNotReadyForPurchasesIsSaidPlainly() async {
        final class Requests: @unchecked Sendable { var all: [URLRequest] = [] }
        let requests = Requests()
        let live = FerniAppleAccountAPI(
            baseURL: URL(string: "https://api.example.test")!,
            idToken: { "id-token" },
            send: { request in
                requests.all.append(request)
                let response = HTTPURLResponse(url: request.url!, statusCode: 503, httpVersion: nil, headerFields: nil)!
                return (Data(#"{"error":"Purchases aren't available yet"}"#.utf8), response)
            }
        )
        let product = StoreProduct()
        let model = model(live, product: product)

        await model.join(.friend)

        XCTAssertEqual(requests.all.map { $0.url?.path }, ["/api/apple/account-token"])
        XCTAssertTrue(product.purchaseCalls.isEmpty)
        XCTAssertEqual(model.phase, .notice("Purchases aren't available yet."))
        XCTAssertFalse(model.isWorking, "no endless spinner")
    }

    func testNoAppStoreProductIsSaidPlainlyAndNothingIsFetched() async {
        let api = AccountAPI(.success(UUID()))
        let model = model(api, product: nil)

        await model.join(.partner)

        XCTAssertEqual(api.tokenFetches, 0)
        XCTAssertEqual(model.phase, .notice("Purchases aren't available yet."))
    }

    func testPlanNamesWhoJoins() {
        XCTAssertEqual(SubscriptionTier.friend.teammateNames, "Maya, Peter, Alex and Jordan")
        XCTAssertEqual(SubscriptionTier.partner.teammateNames, "Maya, Peter, Alex, Jordan and Nayan")
    }
}
