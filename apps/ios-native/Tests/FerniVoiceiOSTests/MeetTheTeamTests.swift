import FerniShared
import Foundation
import StoreKit
import SwiftUI
import XCTest
@testable import FerniVoice

/// Tapping a teammate who isn't on the team yet introduces them, and joining
/// from there buys only with the server's account token.
@MainActor
final class MeetTheTeamTests: XCTestCase {

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
        let team = TeamUnlockService.evaluate(stage: .firstMeeting, stageProgress: 0, plan: .free).unlocked

        XCTAssertEqual(PersonaPickerSheet.cardTap(personaId: "maya", team: team), .meet("maya"))
        XCTAssertEqual(PersonaPickerSheet.cardTap(personaId: "nayan", team: team), .meet("nayan"))
        XCTAssertEqual(PersonaPickerSheet.cardTap(personaId: "ferni", team: team), .talk("ferni"))
    }

    func testOnceTheyJoinTheTapStartsTheConversation() {
        let team = TeamUnlockService.evaluate(stage: .firstMeeting, stageProgress: 0, plan: .friend).unlocked

        XCTAssertEqual(PersonaPickerSheet.cardTap(personaId: "maya", team: team), .talk("maya"))
        XCTAssertEqual(PersonaPickerSheet.cardTap(personaId: "nayan", team: team), .meet("nayan"))
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

    // MARK: - Snapshots (evidence for humans; run with TEST_RUNNER_FERNI_SNAPSHOT_DIR=<dir>)

    func testSnapshotMeetSheetAndYourPlan() throws {
        guard let dir = ProcessInfo.processInfo.environment["FERNI_SNAPSHOT_DIR"] else {
            throw XCTSkip("set TEST_RUNNER_FERNI_SNAPSHOT_DIR to write snapshots")
        }
        let unavailable = model(AccountAPI(.success(UUID())), product: nil)
        let screens: [(String, AnyView)] = [
            ("meet-maya", AnyView(MeetTeammateSheet(persona: PersonaRegistry.maya, model: model(AccountAPI(.success(UUID())), product: StoreProduct())) { _ in })),
            ("meet-nayan", AnyView(MeetTeammateSheet(persona: PersonaRegistry.nayan, model: model(AccountAPI(.success(UUID())), product: StoreProduct())) { _ in })),
            ("meet-peter-unavailable", AnyView(MeetTeammateSheet(persona: PersonaRegistry.peter, model: unavailable) { _ in })),
            ("your-plan", AnyView(NavigationView { YourPlanView(model: model(AccountAPI(.success(UUID())), product: nil)) }.preferredColorScheme(.dark))),
        ]
        let waiter = expectation(description: "unavailable notice")
        Task {
            await unavailable.join(.friend)
            waiter.fulfill()
        }
        wait(for: [waiter], timeout: 5)

        // A window only draws when it belongs to a scene: use the host app's.
        let scene = try XCTUnwrap(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first)
        for (name, view) in screens {
            let window = UIWindow(windowScene: scene)
            window.frame = CGRect(x: 0, y: 0, width: 393, height: 852)
            window.rootViewController = UIHostingController(rootView: view)
            window.makeKeyAndVisible()
            RunLoop.main.run(until: Date().addingTimeInterval(0.5))
            let image = UIGraphicsImageRenderer(bounds: window.bounds).image { _ in
                window.drawHierarchy(in: window.bounds, afterScreenUpdates: true)
            }
            try XCTUnwrap(image.pngData()).write(to: URL(fileURLWithPath: dir).appendingPathComponent("\(name).png"))
        }
    }
}
