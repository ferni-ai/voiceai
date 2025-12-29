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
//  - Sync with backend
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
    
    // Backend sync
    private var serverBaseUrl = "https://app.ferni.ai"
    private var userId: String?
    
    // MARK: - Initialization
    
    private init() {
        // Load cached tier
        if let cachedTier = defaults.string(forKey: tierCacheKey),
           let tier = SubscriptionTier(rawValue: cachedTier) {
            currentTier = tier
            isSubscribed = tier != .free
        }
        
        if let expiration = defaults.object(forKey: expirationCacheKey) as? Date {
            subscriptionExpirationDate = expiration
        }
        
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
    
    // MARK: - Configuration
    
    func configure(userId: String, serverUrl: String? = nil) {
        self.userId = userId
        if let url = serverUrl {
            self.serverBaseUrl = url
        }
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
        
        // Check all current entitlements
        for await result in Transaction.currentEntitlements {
            guard case .verified(let transaction) = result else {
                continue
            }
            
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
        
        // Sync with backend
        await syncWithBackend()
    }
    
    // MARK: - Purchase
    
    func purchase(_ product: Product) async -> PurchaseResult {
        purchaseInProgress = true
        defer { purchaseInProgress = false }
        
        do {
            let result = try await product.purchase()
            
            switch result {
            case .success(let verification):
                switch verification {
                case .verified(let transaction):
                    // Successful purchase
                    await transaction.finish()
                    
                    let tier = ProductID.tier(for: transaction.productID)
                    updateTier(tier, expiration: transaction.expirationDate)
                    
                    logger.info("Purchase successful: \(product.id)")
                    await syncWithBackend()
                    
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
    
    /// Purchase by tier (finds the monthly product)
    func purchase(tier: SubscriptionTier) async -> PurchaseResult {
        let productId: String
        switch tier {
        case .friend:
            productId = ProductID.friendMonthly
        case .partner:
            productId = ProductID.partnerMonthly
        case .free:
            return .failed(.invalidProduct)
        }
        
        guard let product = availableProducts.first(where: { $0.id == productId }) else {
            lastError = .productNotFound
            return .failed(.productNotFound)
        }
        
        return await purchase(product)
    }
    
    // MARK: - Restore Purchases
    
    func restorePurchases() async {
        logger.info("Restoring purchases...")
        
        do {
            try await AppStore.sync()
            await checkSubscriptionStatus()
            logger.info("Purchases restored")
        } catch {
            logger.error("Failed to restore purchases: \(error.localizedDescription)")
            lastError = .restoreFailed
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
                    await transaction.finish()
                    await self.syncWithBackend()
                    
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
    
    // MARK: - Backend Sync
    
    private func syncWithBackend() async {
        guard let userId = userId else { return }
        
        do {
            // Get latest receipt
            guard let receiptURL = Bundle.main.appStoreReceiptURL,
                  let receiptData = try? Data(contentsOf: receiptURL) else {
                logger.warning("No receipt to sync")
                return
            }
            
            let receiptString = receiptData.base64EncodedString()
            
            // Send to backend
            guard let url = URL(string: "\(serverBaseUrl)/api/subscription/verify-ios") else {
                return
            }
            
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            
            let body: [String: Any] = [
                "userId": userId,
                "receipt": receiptString,
                "tier": currentTier.rawValue
            ]
            
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
            
            let (_, response) = try await URLSession.shared.data(for: request)
            
            if let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 {
                logger.info("Subscription synced with backend")
            }
        } catch {
            logger.error("Failed to sync with backend: \(error.localizedDescription)")
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
    case productNotFound
    case purchaseFailed
    case verificationFailed
    case restoreFailed
    case invalidProduct
    case unknown
    
    var errorDescription: String? {
        switch self {
        case .productLoadFailed:
            return "Couldn't load subscription options"
        case .productNotFound:
            return "Subscription not found"
        case .purchaseFailed:
            return "Purchase failed"
        case .verificationFailed:
            return "Couldn't verify purchase"
        case .restoreFailed:
            return "Couldn't restore purchases"
        case .invalidProduct:
            return "Invalid product"
        case .unknown:
            return "Something went wrong"
        }
    }
}

// MARK: - Subscription View Model (for UI)

@MainActor
final class SubscriptionViewModel: ObservableObject {
    @Published var products: [Product] = []
    @Published var currentTier: SubscriptionTier = .free
    @Published var isLoading: Bool = false
    @Published var errorMessage: String?
    @Published var showSuccessAlert: Bool = false
    
    private let service = SubscriptionService.shared
    private var cancellables = Set<AnyCancellable>()
    
    init() {
        // Bind to service
        service.$availableProducts
            .assign(to: &$products)
        
        service.$currentTier
            .assign(to: &$currentTier)
        
        service.$purchaseInProgress
            .assign(to: &$isLoading)
        
        service.$lastError
            .map { $0?.localizedDescription }
            .assign(to: &$errorMessage)
    }
    
    func purchase(_ product: Product) async {
        let result = await service.purchase(product)
        
        switch result {
        case .success:
            showSuccessAlert = true
        case .failed(let error):
            errorMessage = error.localizedDescription
        default:
            break
        }
    }
    
    func restore() async {
        await service.restorePurchases()
    }
    
    func manageSubscription() async {
        await service.manageSubscription()
    }
    
    // MARK: - Formatted Prices
    
    func formattedPrice(for product: Product) -> String {
        return product.displayPrice
    }
    
    func monthlyEquivalent(for product: Product) -> String? {
        // If yearly, show monthly equivalent
        if product.id.contains("yearly") {
            let monthly = product.price / 12
            return "$\(monthly.formatted(.number.precision(.fractionLength(2))))/mo"
        }
        return nil
    }
    
    func savingsPercentage(for product: Product) -> Int? {
        // Calculate savings for yearly vs monthly
        guard product.id.contains("yearly") else { return nil }
        
        let tier = ProductID.tier(for: product.id)
        let monthlyPrice = tier.monthlyPrice
        let yearlyMonthly = product.price / 12
        
        let savings = ((monthlyPrice - yearlyMonthly) / monthlyPrice) * 100
        return Int(savings.rounded())
    }
}
