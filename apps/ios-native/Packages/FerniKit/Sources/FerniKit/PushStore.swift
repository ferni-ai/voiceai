import Foundation
import os
import Security

/// Who this phone's push token belongs to, kept in the Keychain so it
/// survives relaunches.
public struct PushBinding: Codable, Equatable, Sendable {
    public var token: String?
    /// The account the server has confirmed it's registered to; nil when unbound.
    public var owner: String?
    /// Accounts a registration was sent as whose outcome is unknown (timed
    /// out, server error, or the account changed before it finished), so the
    /// server might have the token bound to any of them. Each is recorded
    /// before sending and removed only by a confirmed answer.
    public var maybeOwners: Set<String> = []
    /// Everyone on this phone who said yes to notes from Ferni.
    public var optedIn: Set<String> = []
    /// The server's opaque tag for the owner (after #1991); the notification
    /// extension drops pushes whose tag doesn't match.
    public var recipientTag: String?

    public init(token: String? = nil, owner: String? = nil, maybeOwners: Set<String> = [], optedIn: Set<String> = []) {
        self.token = token
        self.owner = owner
        self.maybeOwners = maybeOwners
        self.optedIn = optedIn
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        token = try c.decodeIfPresent(String.self, forKey: .token)
        owner = try c.decodeIfPresent(String.self, forKey: .owner)
        maybeOwners = try c.decodeIfPresent(Set<String>.self, forKey: .maybeOwners) ?? []
        optedIn = try c.decodeIfPresent(Set<String>.self, forKey: .optedIn) ?? []
        recipientTag = try c.decodeIfPresent(String.self, forKey: .recipientTag)
    }

    /// The server might have the token bound to someone: confirmed or unknown.
    var mightBeBound: Bool { owner != nil || !maybeOwners.isEmpty }
}

/// Where the binding is kept. The Keychain in the app; memory in tests.
public protocol PushVault: Sendable {
    func load() -> PushBinding
    func save(_ binding: PushBinding)
}

/// This phone's push address, bound only to someone who said yes (#1991):
/// POST /api/push/devices registers it to the signed-in account (moving it
/// from anyone else), DELETE unbinds it (owner-only; a no-op for anyone else).
///
/// A signed-out person's notes must stop reaching the phone even when a
/// request fails or races a sign-out:
/// - every operation runs one at a time, so sign-out waits for a
///   registration still in flight;
/// - an unconfirmed registration is recorded before it's sent (`maybeOwners`),
///   and only an explicit rejection clears it;
/// - `reconcile` registers the token to whoever is signed in now (which takes
///   it from anyone else) and, unless they opted in, unbinds it again.
@MainActor
@Observable
public final class PushStore {
    public private(set) var binding: PushBinding
    private let api: FerniAPI
    private let vault: any PushVault
    private let bundleID: String
    private let environment: String
    private let appVersion: String
    private let currentUID: @MainActor () -> String?
    private var tail: Task<Void, Never>?
    private let log = Logger(subsystem: "com.sethdford.ferni", category: "push")

    /// - Parameters:
    ///   - environment: "sandbox" for development builds, "production" for TestFlight and the App Store.
    ///   - currentUID: who is signed in right now (the account the API asks as).
    public init(api: FerniAPI, vault: any PushVault, bundleID: String, environment: String, appVersion: String,
                currentUID: @escaping @MainActor () -> String?) {
        self.api = api
        self.vault = vault
        self.bundleID = bundleID
        self.environment = environment
        self.appVersion = appVersion
        self.currentUID = currentUID
        binding = vault.load()
    }

    public func hasOptedIn(_ uid: String?) -> Bool { uid.map(binding.optedIn.contains) ?? false }

    /// Work is waiting for an account: the token might still be bound to
    /// someone and nobody is signed in to finish the unbind.
    public var needsAccount: Bool { binding.token != nil && binding.mightBeBound && currentUID() == nil }

    /// "Yes, check in" while signed in as `uid`.
    public func optIn(uid: String) async {
        await serially {
            self.binding.optedIn.insert(uid)
            self.save()
            await self.settle(uid: uid)
        }
    }

    /// APNs gave the app a token (it can change at any launch).
    public func received(deviceToken: Data, uid: String?) async {
        let token = deviceToken.map { String(format: "%02x", $0) }.joined()
        await serially {
            if token != self.binding.token { // a new token isn't registered anywhere yet
                self.binding.owner = nil
                self.binding.maybeOwners = []
                self.binding.recipientTag = nil
            }
            self.binding.token = token
            self.save()
            await self.settle(uid: uid)
        }
    }

    /// Makes the server match: bound to `uid` if they opted in, else to nobody.
    /// Safe to call any time (launch, sign-in change, network back).
    public func reconcile(uid: String?) async {
        await serially { await self.settle(uid: uid) }
    }

    /// Before signing out, as the person leaving; waits for any registration
    /// in flight first. False if the server never confirmed; the binding then
    /// remembers them and `reconcile` finishes as the next account.
    @discardableResult
    public func unbindBeforeSignOut(uid: String) async -> Bool {
        await serially {
            defer { self.binding.optedIn.remove(uid); self.save() }
            // This person might own it: DELETE (a no-op on the server for anyone else).
            guard self.binding.token != nil, self.binding.owner == uid || self.binding.maybeOwners.contains(uid) else { return true }
            for attempt in 0..<2 {
                if attempt > 0 { try? await Task.sleep(for: .seconds(1)) }
                if await self.unregister(as: uid) { return true }
            }
            self.log.error("Sign-out unbind failed; the next account takes the token over")
            return false
        }
    }

    // MARK: - One at a time

    /// Runs `work` after everything queued before it.
    private func serially<T: Sendable>(_ work: @escaping @MainActor () async -> T) async -> T {
        let previous = tail
        let task = Task { @MainActor in
            await previous?.value
            return await work()
        }
        tail = Task { _ = await task.value }
        return await task.value
    }

    private func settle(uid: String?) async {
        guard binding.token != nil else { return }
        guard let uid else {
            if binding.mightBeBound { log.info("Push unbind waits for an account") }
            return
        }
        let wanted = hasOptedIn(uid)
        if binding.maybeOwners.isEmpty {
            if binding.owner == uid && wanted { return }
            if binding.owner == nil && !wanted { return }
        }
        if binding.owner != uid || !binding.maybeOwners.isEmpty {
            guard await register(as: uid) else {
                // Signed in as someone else by the time it answered: settle as them.
                if let now = currentUID(), now != uid { await settle(uid: now) }
                return
            }
        }
        if !wanted { _ = await unregister(as: uid) }
    }

    // MARK: - Server

    /// POST as `uid`. True only when the server confirmed it for `uid`.
    /// Nobody leaves `maybeOwners` here except on a confirmed registration,
    /// which moved the token away from all of them.
    private func register(as uid: String) async -> Bool {
        guard let token = binding.token else { return false }
        let before = binding.maybeOwners
        binding.maybeOwners.insert(uid)
        save()
        switch await post(token) {
        case .rejected:
            binding.maybeOwners = before // the server changed nothing
        case .unknown:
            break
        case .registered(let tag):
            guard let now = currentUID(), now == uid else {
                // Sent as `uid` or as whoever signed in meanwhile: the token
                // moved away from the old owner, to one of those two.
                log.error("Account changed during registration; settling as the new account")
                binding.owner = nil
                binding.recipientTag = nil
                if let now = currentUID() { binding.maybeOwners.insert(now) }
                break
            }
            binding.owner = uid
            binding.maybeOwners = []
            binding.recipientTag = tag
            save()
            return true
        }
        save()
        return false
    }

    /// DELETE as `uid`. Clears what that answer settles: their confirmed
    /// binding and their unknown one (the server only removes it if it's theirs).
    private func unregister(as uid: String) async -> Bool {
        guard let token = binding.token, currentUID() == uid, await delete(token) else { return false }
        if binding.owner == uid {
            binding.owner = nil
            binding.recipientTag = nil
        }
        binding.maybeOwners.remove(uid)
        save()
        return true
    }

    private enum PostOutcome { case registered(tag: String?), rejected, unknown }

    private func post(_ token: String) async -> PostOutcome {
        struct Body: Encodable, Sendable {
            let platform = "ios"
            let token: String
            let bundleId: String
            let environment: String
            let appVersion: String
        }
        struct Answer: Decodable { let recipientTag: String? }
        do {
            let data = try await api.data("/api/push/devices", method: "POST", json: Body(
                token: token, bundleId: bundleID, environment: environment, appVersion: appVersion
            ))
            return .registered(tag: (try? JSONDecoder().decode(Answer.self, from: data))?.recipientTag)
        } catch FerniAPIError.status(let code) where [400, 403, 404, 422].contains(code) {
            log.error("Device registration refused: \(code, privacy: .public)")
            return .rejected
        } catch {
            // Timeouts, 5xx, 408/409/429, and no session to send with: keep
            // the maybe-owner (an extra DELETE later is harmless; a lost one isn't).
            log.error("Device registration outcome unknown: \(String(describing: error), privacy: .public)")
            return .unknown
        }
    }

    private func delete(_ token: String) async -> Bool {
        struct Body: Encodable, Sendable { let token: String }
        do {
            _ = try await api.data("/api/push/devices", method: "DELETE", json: Body(token: token))
            return true
        } catch {
            return false
        }
    }

    private func save() { vault.save(binding) }
}

/// The binding in the Keychain (this device only, available after first unlock).
public struct KeychainPushVault: PushVault {
    private let account = "ferni.push.binding"

    public init() {}

    public func load() -> PushBinding {
        var query = base()
        query[kSecReturnData as String] = true
        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess, let data = item as? Data,
              let binding = try? JSONDecoder().decode(PushBinding.self, from: data) else { return PushBinding() }
        return binding
    }

    public func save(_ binding: PushBinding) {
        guard let data = try? JSONEncoder().encode(binding) else { return }
        let update = [kSecValueData as String: data, kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly] as CFDictionary
        if SecItemUpdate(base() as CFDictionary, update) == errSecItemNotFound {
            var add = base()
            add[kSecValueData as String] = data
            add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
            SecItemAdd(add as CFDictionary, nil)
        }
    }

    private func base() -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: "com.sethdford.ferni", kSecAttrAccount as String: account]
    }
}
