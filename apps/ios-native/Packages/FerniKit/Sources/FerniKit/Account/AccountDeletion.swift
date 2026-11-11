import Foundation

/// Deleting the account (App Store guideline 5.1.1(v)): the server erases
/// every store, revokes the Sign in with Apple grant (#2004) and deletes the
/// Firebase user, the same DELETE /api/account the web uses.
public enum AccountDeletion {
    public static func delete(using api: FerniAPI) async throws {
        struct Body: Encodable, Sendable { let confirmation = "DELETE_MY_ACCOUNT" }
        _ = try await api.data("/api/account", method: "DELETE", json: Body(), timeout: 60)
    }

    /// What this phone keeps about a person, removed after the server says yes.
    public static let localKeys = ["ferni.call.hasTalked", "ferni.captions", AccountMemory.key]
}
