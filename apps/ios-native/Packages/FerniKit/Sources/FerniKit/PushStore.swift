import Foundation
import os
import Security

/// Who this phone's push token belongs to, kept in the Keychain so it
/// survives relaunches: the token, the account it's registered to on the
/// server (nil when unbound), and who has said yes to notes from Ferni.
public struct PushBinding: Codable, Equatable, Sendable {
    public var token: String?
    public var owner: String?
    public var optedIn: Set<String> = []

    public init(token: String? = nil, owner: String? = nil, optedIn: Set<String> = []) {
        self.token = token
        self.owner = owner
        self.optedIn = optedIn
    }
}

/// Where the binding is kept. The Keychain in the app; memory in tests.
public protocol PushVault: Sendable {
    func load() -> PushBinding
    func save(_ binding: PushBinding)
}

/// This phone's push address, bound only to someone who said yes (#1991):
/// POST /api/push/devices registers it to the signed-in account (moving it
/// from anyone else), DELETE unbinds it (owner-only).
///
/// A signed-out person's notes must stop reaching the phone even when the
/// sign-out DELETE fails: the binding remembers the old owner, and on the
/// next launch, sign-in or network change `reconcile` registers the token to
/// whoever is signed in now (which takes it from the old owner on the server)
/// and, unless that person opted in, unbinds it again.
@MainActor
@Observable
public final class PushStore {
    public private(set) var binding: PushBinding
    private let api: FerniAPI
    private let vault: any PushVault
    private let bundleID: String
    private let environment: String
    private let appVersion: String
    private let log = Logger(subsystem: "com.sethdford.ferni", category: "push")

    /// - Parameter environment: "sandbox" for development builds, "production" for TestFlight and the App Store.
    public init(api: FerniAPI, vault: any PushVault, bundleID: String, environment: String, appVersion: String) {
        self.api = api
        self.vault = vault
        self.bundleID = bundleID
        self.environment = environment
        self.appVersion = appVersion
        binding = vault.load()
    }

    public func hasOptedIn(_ uid: String?) -> Bool { uid.map(binding.optedIn.contains) ?? false }

    /// "Yes, check in" while signed in as `uid`.
    public func optIn(uid: String) async {
        binding.optedIn.insert(uid)
        save()
        await reconcile(uid: uid)
    }

    /// APNs gave the app a token (it can change at any launch).
    public func received(deviceToken: Data, uid: String?) async {
        let token = deviceToken.map { String(format: "%02x", $0) }.joined()
        if token != binding.token { binding.owner = nil } // a new token isn't registered anywhere yet
        binding.token = token
        save()
        await reconcile(uid: uid)
    }

    /// Makes the server match: bound to `uid` if they opted in, else to nobody.
    /// Safe to call any time (launch, sign-in change, network back).
    public func reconcile(uid: String?) async {
        guard let token = binding.token, let uid else { return }
        let wanted = hasOptedIn(uid)
        if binding.owner == uid && wanted { return }
        if binding.owner == nil && !wanted { return }
        if binding.owner != uid {
            // Someone else's binding (a failed sign-out unbind, or none yet):
            // registering as `uid` takes the token from them on the server.
            guard await post(token) else { return }
            binding.owner = uid
            save()
        }
        if !wanted, await delete(token) {
            binding.owner = nil
            save()
        }
    }

    /// Before signing out, as the person leaving. False if the server never
    /// confirmed; the binding then remembers them and `reconcile` finishes later.
    @discardableResult
    public func unbindBeforeSignOut(uid: String) async -> Bool {
        defer { binding.optedIn.remove(uid); save() }
        guard let token = binding.token, binding.owner == uid else { return true }
        for attempt in 0..<2 {
            if attempt > 0 { try? await Task.sleep(for: .seconds(1)) }
            if await delete(token) {
                binding.owner = nil
                return true
            }
        }
        log.error("Sign-out unbind failed; the next sign-in takes the token over")
        return false
    }

    private func post(_ token: String) async -> Bool {
        struct Body: Encodable, Sendable {
            let platform = "ios"
            let token: String
            let bundleId: String
            let environment: String
            let appVersion: String
        }
        do {
            _ = try await api.data("/api/push/devices", method: "POST", json: Body(
                token: token, bundleId: bundleID, environment: environment, appVersion: appVersion
            ))
            return true
        } catch {
            log.error("Device not registered: \(String(describing: error), privacy: .public)")
            return false
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
