//
//  SubscriptionService.swift
//  FerniVoice
//
//  Native StoreKit 2 subscription management.
//  Handles in-app purchases and subscription status natively on iOS.
//
//  🎯 CAPABILITIES:
//  - Check subscription status
//  - Purchase subscriptions
//  - Restore purchases
//  - Handle subscription changes
//  - Send verified transactions to the server (POST /api/apple/verify)
//
//  Every purchase carries the account's appAccountToken (see AppleAccountAPI),
//  so the server can tell whose purchase it is. No token, no purchase.
//

import Foundation
import StoreKit
import os
import Combine

// MARK: - Subscription Tiers

enum SubscriptionTier: String, CaseIterable {
    case free = "free"
    case friend = "friend"      // $9.99/month
    case partner = "partner"    // $19.99/month
    
    var displayName: String {
        switch self {
        case .free: return "Free"
        case .friend: return "Friend"
        case .partner: return "Partner"
        }
    }
    
    var monthlyPrice: Decimal {
        switch self {
        case .free: return 0
        case .friend: return 9.99
        case .partner: return 19.99
        }
    }
    
    /// Team members available at this tier
    var availablePersonas: [String] {
        switch self {
        case .free:
            return ["ferni"]  // Only Ferni on free tier
        case .friend:
            return ["ferni", "maya", "peter", "alex", "jordan"]
        case .partner:
            return ["ferni", "maya", "peter", "alex", "jordan", "nayan"]
        }
    }
    
    /// The first paid plan that brings this teammate in (nil for Ferni, who's always here).
    static func plan(including personaId: String) -> SubscriptionTier? {
        let id = personaId.lowercased()
        guard !SubscriptionTier.free.availablePersonas.contains(id) else { return nil }
        return [SubscriptionTier.friend, .partner].first { $0.availablePersonas.contains(id) }
    }

    /// Monthly conversation limit (nil = unlimited)
    var conversationLimit: Int? {
        switch self {
        case .free: return 5
        case .friend: return nil
        case .partner: return nil
        }
    }
}

// MARK: - Product IDs

enum ProductID {
    static let friendMonthly = "com.ferni.subscription.friend.monthly"
    static let friendYearly = "com.ferni.subscription.friend.yearly"
    static let partnerMonthly = "com.ferni.subscription.partner.monthly"
    static let partnerYearly = "com.ferni.subscription.partner.yearly"
    
    static let all: [String] = [
        friendMonthly, friendYearly,
        partnerMonthly, partnerYearly
    ]
    
    static func tier(for productId: String) -> SubscriptionTier {
        if productId.contains("partner") {
            return .partner
        } else if productId.contains("friend") {
            return .friend
        }
        return .free
    }
}

// MARK: - Subscription Service

@MainActor
final class SubscriptionService: ObservableObject {
    static let shared = SubscriptionService()
    
    // MARK: - Published State
    
    @Published private(set) var currentTier: SubscriptionTier = .free
    @Published private(set) var isSubscribed: Bool = false
    @Published private(set) var subscriptionExpirationDate: Date?
    @Published private(set) var availableProducts: [Product] = []
    @Published private(set) var purchaseInProgress: Bool = false
    @Published private(set) var lastError: SubscriptionError?
    
    // MARK: - Publishers
    
    let tierChangedPublisher = PassthroughSubject<SubscriptionTier, Never>()
    
    // MARK: - Private
    
    private let logger = Logger(subsystem: "com.ferni.FerniVoice", category: "Subscription")
    private var updateListenerTask: Task<Void, Error>?
    private let defaults = UserDefaults.standard
    
    // Cache keys
    private let tierCacheKey = "cached_subscription_tier"
    private let expirationCacheKey = "cached_subscription_expiration"
    
    private let accountAPI: AppleAccountAPI
    
    // MARK: - Initialization
    
    /// `observeStore: false` skips the StoreKit listener and product fetch (tests).
    init(accountAPI: AppleAccountAPI = FerniAppleAccountAPI(), observeStore: Bool = true) {
        self.accountAPI = accountAPI
        // Load cached tier
        if let cachedTier = defaults.string(forKey: tierCacheKey),
           let tier = SubscriptionTier(rawValue: cachedTier) {
            currentTier = tier
            isSubscribed = tier != .free
        }
        
        if let expiration = defaults.object(forKey: expirationCacheKey) as? Date {
            subscriptionExpirationDate = expiration
        }
        
        guard observeStore else { return }
        
        // Start listening for transactions
        updateListenerTask = listenForTransactions()
        
        // Fetch products and check status
        Task {
            await loadProducts()
            await checkSubscriptionStatus()
        }
    }
    
    deinit {
        updateListenerTask?.cancel()
    }
    
    // MARK: - Load Products
    
    func loadProducts() async {
        do {
            let products = try await Product.products(for: ProductID.all)
            availableProducts = products.sorted { $0.price < $1.price }
            logger.info("Loaded \(products.count) products")
        } catch {
            logger.error("Failed to load products: \(error.localizedDescription)")
            lastError = .productLoadFailed
        }
    }
    
    // MARK: - Check Subscription Status
    
    func checkSubscriptionStatus() async {
        var highestTier: SubscriptionTier = .free
        var latestExpiration: Date?
        var signedTransactions: [String] = []
        
        // Check all current entitlements
        for await result in Transaction.currentEntitlements {
            guard case .verified(let transaction) = result else {
                continue
            }
            signedTransactions.append(result.jwsRepresentation)
            
            // Check if this is a subscription we care about
            let tier = ProductID.tier(for: transaction.productID)
            if tier.rawValue > highestTier.rawValue {
                highestTier = tier
            }
            
            // Track expiration
            if let expiration = transaction.expirationDate {
                if latestExpiration == nil || expiration > latestExpiration! {
                    latestExpiration = expiration
                }
            }
        }
        
        // Update state
        updateTier(highestTier, expiration: latestExpiration)
        
        for jws in signedTransactions {
            _ = await sendToServer(jws)
        }
    }
    
    // MARK: - Purchase
    
    func purchase(_ product: some PurchasableProduct) async -> PurchaseResult {
        purchaseInProgress = true
        defer { purchaseInProgress = false }
        lastError = nil  // so a stale error isn't read as this purchase's outcome

        // The purchase must carry this account's token: if we can't get it, don't buy.
        let options: Set<Product.PurchaseOption>
        do {
            options = try await AccountBoundPurchase.options(from: accountAPI)
        } catch {
            logger.error("No appAccountToken, purchase not started: \(error.localizedDescription)")
            let failure: SubscriptionError
            switch error as? AppleAccountAPIError {
            case .notSignedIn: failure = .signInRequired
            // 503: the server can't record App Store purchases yet, so don't take any.
            case .badStatus(503): failure = .purchasesUnavailable
            default: failure = .accountUnavailable
            }
            lastError = failure
            return .failed(failure)
        }
        
        do {
            let result = try await product.purchase(options: options)
            
            switch result {
            case .success(let verification):
                switch verification {
                case .verified(let transaction):
                    let tier = ProductID.tier(for: transaction.productID)
                    updateTier(tier, expiration: transaction.expirationDate)
                    logger.info("Purchase successful: \(product.id)")
                    
                    // Finish only once the server has it; otherwise StoreKit
                    // redelivers it through Transaction.updates and we retry.
                    if await sendToServer(verification.jwsRepresentation) {
                        await transaction.finish()
                    } else {
                        lastError = .serverSyncFailed
                    }
                    return .success(tier)
                    
                case .unverified(_, let error):
                    logger.error("Purchase unverified: \(error.localizedDescription)")
                    lastError = .verificationFailed
                    return .failed(.verificationFailed)
                }
                
            case .pending:
                logger.info("Purchase pending (e.g., parental approval)")
                return .pending
                
            case .userCancelled:
                logger.info("User cancelled purchase")
                return .cancelled
                
            @unknown default:
                return .failed(.unknown)
            }
        } catch {
            logger.error("Purchase failed: \(error.localizedDescription)")
            lastError = .purchaseFailed
            return .failed(.purchaseFailed)
        }
    }
    
    /// The monthly App Store product for a paid tier, once products have loaded.
    func monthlyProduct(for tier: SubscriptionTier) -> Product? {
        let productId: String
        switch tier {
        case .friend: productId = ProductID.friendMonthly
        case .partner: productId = ProductID.partnerMonthly
        case .free: return nil
        }
        return availableProducts.first { $0.id == productId }
    }

    // MARK: - Restore Purchases

    /// Re-sync with the App Store. Returns the tier afterwards, or nil if it failed.
    @discardableResult
    func restorePurchases() async -> SubscriptionTier? {
        logger.info("Restoring purchases...")

        do {
            try await AppStore.sync()
            await checkSubscriptionStatus()
            logger.info("Purchases restored")
            return currentTier
        } catch {
            logger.error("Failed to restore purchases: \(error.localizedDescription)")
            lastError = .restoreFailed
            return nil
        }
    }
    
    // MARK: - Transaction Listener
    
    private func listenForTransactions() -> Task<Void, Error> {
        return Task.detached { [weak self] in
            for await result in Transaction.updates {
                guard let self = self else { return }
                
                switch result {
                case .verified(let transaction):
                    await MainActor.run {
                        let tier = ProductID.tier(for: transaction.productID)
                        self.updateTier(tier, expiration: transaction.expirationDate)
                        self.logger.info("Transaction update: \(transaction.productID)")
                    }
                    if await self.sendToServer(result.jwsRepresentation) {
                        await transaction.finish()
                    }
                    
                case .unverified(_, let error):
                    await MainActor.run {
                        self.logger.error("Unverified transaction: \(error.localizedDescription)")
                    }
                }
            }
        }
    }
    
    // MARK: - Update Tier
    
    private func updateTier(_ tier: SubscriptionTier, expiration: Date?) {
        let oldTier = currentTier
        currentTier = tier
        isSubscribed = tier != .free
        subscriptionExpirationDate = expiration
        
        // Cache locally
        defaults.set(tier.rawValue, forKey: tierCacheKey)
        if let exp = expiration {
            defaults.set(exp, forKey: expirationCacheKey)
        }
        
        // Notify listeners
        if oldTier != tier {
            tierChangedPublisher.send(tier)
            logger.info("Tier changed: \(oldTier.rawValue) → \(tier.rawValue)")
            
            // Notify Watch
            WatchConnectivityService.shared.sendSubscriptionStatus(isSubscribed: isSubscribed)
        }
    }
    
    // MARK: - Server
    
    /// Send a verified transaction's JWS to the server. True when it accepted it.
    private func sendToServer(_ jws: String) async -> Bool {
        do {
            try await accountAPI.submitSignedTransaction(jws)
            logger.info("Purchase sent to the server")
            return true
        } catch {
            logger.error("Couldn't send the purchase to the server: \(error.localizedDescription)")
            return false
        }
    }
    
    // MARK: - Manage Subscription
    
    /// Open App Store subscription management
    func manageSubscription() async {
        guard let windowScene = UIApplication.shared.connectedScenes.first as? UIWindowScene else {
            return
        }
        
        do {
            try await AppStore.showManageSubscriptions(in: windowScene)
        } catch {
            logger.error("Failed to show subscription management: \(error.localizedDescription)")
        }
    }
    
    // MARK: - Feature Gating
    
    /// Check if a persona is available at current tier
    func isPersonaAvailable(_ personaId: String) -> Bool {
        return currentTier.availablePersonas.contains(personaId.lowercased())
    }
    
    /// Check if user has conversations remaining (for free tier)
    func canStartConversation(currentCount: Int) -> Bool {
        guard let limit = currentTier.conversationLimit else {
            return true  // Unlimited
        }
        return currentCount < limit
    }
    
    /// Get remaining conversations (nil = unlimited)
    func remainingConversations(currentCount: Int) -> Int? {
        guard let limit = currentTier.conversationLimit else {
            return nil
        }
        return max(0, limit - currentCount)
    }
}

// MARK: - Purchase Result

enum PurchaseResult {
    case success(SubscriptionTier)
    case pending
    case cancelled
    case failed(SubscriptionError)
}

// MARK: - Subscription Errors

enum SubscriptionError: Error, LocalizedError {
    case productLoadFailed
    case purchaseFailed
    case verificationFailed
    case restoreFailed
    case signInRequired
    case accountUnavailable
    case purchasesUnavailable
    case serverSyncFailed
    case unknown

    var errorDescription: String? {
        switch self {
        case .productLoadFailed:
            return "Couldn't load the plans. Try again?"
        case .purchaseFailed:
            return "That didn't go through. Try again?"
        case .verificationFailed:
            return "Couldn't confirm that purchase. Try again?"
        case .restoreFailed:
            return "Couldn't restore purchases. Try again?"
        case .signInRequired:
            return "Sign in to subscribe."
        case .accountUnavailable:
            return "Couldn't start that right now. Try again?"
        case .purchasesUnavailable:
            return "Purchases aren't available yet."
        case .serverSyncFailed:
            return "You're subscribed, but we couldn't link it to your account yet. We'll keep trying."
        case .unknown:
            return "That didn't work. Try again?"
        }
    }
}
