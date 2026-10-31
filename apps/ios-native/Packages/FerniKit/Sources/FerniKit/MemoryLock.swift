import Foundation
import LocalAuthentication

/// Who can prove they own this phone: Face ID, Touch ID or Optic ID, with the
/// passcode as the fallback.
public protocol DeviceOwnerCheck: Sendable {
    /// What the phone will use ("Face ID"), or nil when it can't check at all.
    func method() -> String?
    func confirm(reason: String) async -> Bool
}

/// An optional lock on "What Ferni remembers" (off by default). On, the screen
/// stays locked until the phone's owner confirms, and locks again whenever the
/// app leaves the foreground. Turning it on or off needs the owner too.
@MainActor
@Observable
public final class MemoryLock {
    public private(set) var isEnabled: Bool
    public private(set) var isUnlocked = false
    public var isLocked: Bool { isEnabled && !isUnlocked }

    private let defaults: UserDefaults
    private let check: any DeviceOwnerCheck
    static let key = "ferni.memories.locked"

    public init(defaults: UserDefaults = .standard, check: any DeviceOwnerCheck = LocalOwnerCheck()) {
        self.defaults = defaults
        self.check = check
        isEnabled = defaults.bool(forKey: Self.key)
    }

    /// "Face ID", "Touch ID", "Optic ID" or "passcode"; nil when this phone can't lock.
    public var method: String? { check.method() }

    /// Turn the lock on or off, once the owner confirms. False if they didn't.
    @discardableResult
    public func setEnabled(_ on: Bool) async -> Bool {
        guard on != isEnabled else { return true }
        let reason = on ? String(localized: "Lock what Ferni remembers") : String(localized: "Unlock what Ferni remembers for good")
        guard await check.confirm(reason: reason) else { return false }
        isEnabled = on
        isUnlocked = on // you just proved it's you
        defaults.set(on, forKey: Self.key)
        return true
    }

    /// Show what Ferni remembers, once the owner confirms.
    @discardableResult
    public func unlock() async -> Bool {
        guard isLocked else { return true }
        isUnlocked = await check.confirm(reason: String(localized: "See what Ferni remembers"))
        return isUnlocked
    }

    /// The app left the foreground: locked again next time.
    public func lock() { isUnlocked = false }

    /// Signing out or deleting the account: the next person starts without a lock.
    public func reset() {
        isEnabled = false
        isUnlocked = false
        defaults.removeObject(forKey: Self.key)
    }
}

/// The phone's own owner check (LocalAuthentication).
public struct LocalOwnerCheck: DeviceOwnerCheck {
    public init() {}

    public func method() -> String? {
        let context = LAContext()
        guard context.canEvaluatePolicy(.deviceOwnerAuthentication, error: nil) else { return nil }
        _ = context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: nil)
        switch context.biometryType {
        case .faceID: return "Face ID"
        case .touchID: return "Touch ID"
        case .opticID: return "Optic ID"
        default: return String(localized: "passcode")
        }
    }

    public func confirm(reason: String) async -> Bool {
        (try? await LAContext().evaluatePolicy(.deviceOwnerAuthentication, localizedReason: reason)) ?? false
    }
}
