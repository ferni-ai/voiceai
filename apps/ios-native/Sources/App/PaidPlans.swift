import Foundation

// MARK: - Paid Plans
/// Ferni is free for now (product decision, 2026-10-10). While this is false
/// the app never sells or prices a plan: no "Your plan" screen for free users,
/// no plan offer when meeting a teammate, no restore button. The StoreKit code
/// (SubscriptionService, PlanPurchaseModel, Ferni.storekit) stays in place so
/// flipping this back to true brings paid plans back.
///
/// Teammates still join as the relationship with Ferni grows
/// (TeamUnlockService), the same as on the server with PAYWALL off.
enum PaidPlans {
    static let isOffered = false
}
