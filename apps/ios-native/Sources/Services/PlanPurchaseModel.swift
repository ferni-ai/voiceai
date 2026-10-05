//
//  PlanPurchaseModel.swift
//  FerniVoice
//
//  Joining a plan from the app: the "Meet <Name>" sheet and Settings > Your plan.
//  Every attempt ends in a `phase` the UI can say out loud. Nothing retries on
//  its own or spins forever, and nothing is bought without the account token
//  (SubscriptionService.purchase refuses first).
//

import FerniShared
import Foundation
import StoreKit

@MainActor
final class PlanPurchaseModel: ObservableObject {
    enum Phase: Equatable {
        case idle
        case working
        /// Joined; `note` says if the server hasn't linked it to the account yet.
        case joined(SubscriptionTier, note: String?)
        /// Waiting on someone else, e.g. Ask to Buy.
        case pending
        case notice(String)
    }

    @Published private(set) var phase: Phase = .idle

    let service: SubscriptionService
    private let productFor: (SubscriptionTier) -> (any PurchasableProduct)?

    /// `productFor` defaults to the loaded monthly App Store product (tests pass fakes).
    init(
        service: SubscriptionService? = nil,
        productFor: ((SubscriptionTier) -> (any PurchasableProduct)?)? = nil
    ) {
        let service = service ?? SubscriptionService.shared
        self.service = service
        self.productFor = productFor ?? { service.monthlyProduct(for: $0) }
    }

    var isWorking: Bool { phase == .working }

    /// "$9.99", once the App Store has given us the product.
    func price(for tier: SubscriptionTier) -> String? {
        service.monthlyProduct(for: tier)?.displayPrice
    }

    func loadPlansIfNeeded() async {
        if service.availableProducts.isEmpty { await service.loadProducts() }
    }

    func join(_ tier: SubscriptionTier) async {
        guard !isWorking else { return }
        phase = .working
        // No product means the App Store isn't offering the plan here: say so.
        guard let product = productFor(tier) else {
            phase = .notice(Self.message(.purchasesUnavailable))
            return
        }
        switch await service.purchase(product) {
        case .success(let joined):
            let note = service.lastError == .serverSyncFailed ? Self.message(.serverSyncFailed) : nil
            phase = .joined(joined, note: note)
        case .pending:
            phase = .pending
        case .cancelled:
            phase = .idle
        case .failed(let error):
            phase = .notice(Self.message(error))
        }
    }

    func restore() async {
        guard !isWorking else { return }
        phase = .working
        switch await service.restorePurchases() {
        case nil:
            phase = .notice(Self.message(.restoreFailed))
        case .free?:
            phase = .notice("Nothing to restore on this Apple ID.")
        case let tier?:
            phase = .joined(tier, note: nil)
        }
    }

    private static func message(_ error: SubscriptionError) -> String {
        error.errorDescription ?? "That didn't work. Try again?"
    }
}

extension SubscriptionTier {
    /// "Maya, Peter, Alex and Jordan": the teammates this plan brings in beyond Ferni.
    var teammateNames: String {
        let names = availablePersonas
            .filter { !SubscriptionTier.free.availablePersonas.contains($0) }
            .map { PersonaRegistry.get($0).name }
        guard let last = names.last else { return "" }
        return names.count == 1 ? last : names.dropLast().joined(separator: ", ") + " and " + last
    }
}
