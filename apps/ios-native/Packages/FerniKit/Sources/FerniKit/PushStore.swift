import Foundation
import os

/// This phone's push address, kept with whoever is signed in (#1991):
/// POST /api/push/devices when there's a token and an account, and
/// DELETE /api/push/devices before signing out, so a signed-out person's
/// notes stop reaching the phone at once.
@MainActor
@Observable
public final class PushStore {
    public private(set) var token: String?
    private let api: FerniAPI
    private let bundleID: String
    private let environment: String
    private let appVersion: String

    /// - Parameter environment: "sandbox" for development builds, "production" for TestFlight and the App Store.
    public init(api: FerniAPI, bundleID: String, environment: String, appVersion: String) {
        self.api = api
        self.bundleID = bundleID
        self.environment = environment
        self.appVersion = appVersion
    }

    /// APNs gave the app a token: remember it and register it for the signed-in person.
    @discardableResult
    public func received(deviceToken: Data) async -> Bool {
        token = deviceToken.map { String(format: "%02x", $0) }.joined()
        return await register()
    }

    /// Registers the token for whoever is signed in now (also after a sign-in change).
    @discardableResult
    public func register() async -> Bool {
        guard let token else { return false }
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
            Logger(subsystem: "com.sethdford.ferni", category: "push").info("Device registered for notes")
            return true
        } catch {
            Logger(subsystem: "com.sethdford.ferni", category: "push")
                .error("Device not registered: \(String(describing: error), privacy: .public)")
            return false
        }
    }

    /// Before signing out: this phone stops receiving the person's notes.
    public func unregister() async {
        guard let token else { return }
        struct Body: Encodable, Sendable { let token: String }
        _ = try? await api.data("/api/push/devices", method: "DELETE", json: Body(token: token))
    }
}
