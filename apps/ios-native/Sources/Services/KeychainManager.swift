import Foundation
import Security

/// Secure credential storage using iOS Keychain
/// Used for storing Firebase tokens and user credentials
final class KeychainManager {
    static let shared = KeychainManager()

    private init() {}

    // MARK: - Keychain Keys

    enum Key: String {
        case firebaseIdToken = "com.ferni.firebase.idToken"
        case firebaseRefreshToken = "com.ferni.firebase.refreshToken"
        case appleUserId = "com.ferni.apple.userId"
        case userEmail = "com.ferni.user.email"
        case displayName = "com.ferni.user.displayName"
    }

    // MARK: - Public API

    /// Save a string value to the Keychain
    /// - Parameters:
    ///   - value: The string to save
    ///   - key: The key to save under
    /// - Returns: Whether the save was successful
    @discardableResult
    func save(_ value: String, for key: Key) -> Bool {
        guard let data = value.data(using: .utf8) else {
            return false
        }
        return save(data: data, for: key.rawValue)
    }

    /// Retrieve a string value from the Keychain
    /// - Parameter key: The key to retrieve
    /// - Returns: The stored string, or nil if not found
    func get(_ key: Key) -> String? {
        guard let data = getData(for: key.rawValue) else {
            return nil
        }
        return String(data: data, encoding: .utf8)
    }

    /// Delete a value from the Keychain
    /// - Parameter key: The key to delete
    /// - Returns: Whether the deletion was successful
    @discardableResult
    func delete(_ key: Key) -> Bool {
        return deleteData(for: key.rawValue)
    }

    /// Clear all Ferni-related Keychain items
    func clearAll() {
        for key in [Key.firebaseIdToken, .firebaseRefreshToken, .appleUserId, .userEmail, .displayName] {
            delete(key)
        }
    }

    // MARK: - Private Keychain Operations

    private func save(data: Data, for key: String) -> Bool {
        // First, try to delete any existing item
        deleteData(for: key)

        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
            kSecAttrService as String: "com.ferni.FerniVoice",
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        ]

        let status = SecItemAdd(query as CFDictionary, nil)
        return status == errSecSuccess
    }

    private func getData(for key: String) -> Data? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
            kSecAttrService as String: "com.ferni.FerniVoice",
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]

        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)

        guard status == errSecSuccess else {
            return nil
        }

        return result as? Data
    }

    @discardableResult
    private func deleteData(for key: String) -> Bool {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
            kSecAttrService as String: "com.ferni.FerniVoice"
        ]

        let status = SecItemDelete(query as CFDictionary)
        return status == errSecSuccess || status == errSecItemNotFound
    }
}
