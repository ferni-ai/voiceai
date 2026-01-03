import AuthenticationServices
import CryptoKit
import Foundation
import os
import FirebaseAuth
import FirebaseCore

/// Authentication service for Sign In with Apple
/// Manages user authentication state and token refresh
@MainActor
final class AuthService: NSObject, ObservableObject {
    static let shared = AuthService()

    // MARK: - Published State

    @Published private(set) var isSignedIn: Bool = false
    @Published private(set) var userEmail: String?
    @Published private(set) var displayName: String?
    @Published private(set) var isLoading: Bool = false
    @Published private(set) var errorMessage: String?

    // MARK: - Private State

    private let keychain = KeychainManager.shared
    private var currentNonce: String?
    private let logger = Logger(subsystem: "com.ferni.FerniVoice", category: "AuthService")

    // MARK: - Initialization

    private override init() {
        super.init()
        restoreAuthState()
    }

    // MARK: - Public API

    /// Sign in with Apple
    /// Presents the Apple Sign In sheet and handles authentication
    func signInWithApple() async throws {
        isLoading = true
        errorMessage = nil

        defer { isLoading = false }

        let nonce = randomNonceString()
        currentNonce = nonce

        let appleIDProvider = ASAuthorizationAppleIDProvider()
        let request = appleIDProvider.createRequest()
        request.requestedScopes = [.fullName, .email]
        request.nonce = sha256(nonce)

        let result = try await performSignIn(request: request)
        try await handleAuthorizationResult(result)
    }

    /// Sign out the current user
    func signOut() async {
        logger.info("Signing out user")

        // Sign out from Firebase
        do {
            try Auth.auth().signOut()
        } catch {
            logger.error("Firebase sign out error: \(error.localizedDescription)")
        }

        // Clear Keychain
        keychain.clearAll()

        // Update state
        isSignedIn = false
        userEmail = nil
        displayName = nil
        errorMessage = nil

        logger.info("User signed out successfully")
    }

    /// Delete the user's account and all associated data
    /// This is required by App Store for apps with account creation
    func deleteAccount() async {
        logger.info("Deleting user account")
        isLoading = true
        errorMessage = nil

        defer { isLoading = false }

        guard let firebaseToken = await getFirebaseToken() else {
            errorMessage = "Unable to authenticate. Please try again."
            logger.error("Delete account failed: No Firebase token")
            return
        }

        // Call backend API to delete account
        guard let url = URL(string: "https://app.ferni.ai/api/account") else {
            errorMessage = "Invalid server URL"
            return
        }

        var request = URLRequest(url: url)
        request.httpMethod = "DELETE"
        request.setValue("Bearer \(firebaseToken)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        // Add required confirmation body
        let body = ["confirmation": "DELETE_MY_ACCOUNT"]
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)

        do {
            let (data, response) = try await URLSession.shared.data(for: request)

            if let httpResponse = response as? HTTPURLResponse {
                if httpResponse.statusCode == 200 {
                    logger.info("Account deleted successfully on server")
                    // Sign out locally after successful server deletion
                    await signOut()
                } else {
                    // Parse error message from response
                    if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                       let message = json["message"] as? String {
                        errorMessage = message
                    } else {
                        errorMessage = "Failed to delete account. Please try again."
                    }
                    logger.error("Delete account failed with status: \(httpResponse.statusCode)")
                }
            }
        } catch {
            errorMessage = "Network error. Please check your connection."
            logger.error("Delete account network error: \(error.localizedDescription)")
        }
    }

    /// Get the current Firebase ID token for API authentication
    /// Returns nil if user is not signed in
    func getFirebaseToken() async -> String? {
        do {
            return try await Auth.auth().currentUser?.getIDToken()
        } catch {
            logger.error("Failed to get Firebase token: \(error.localizedDescription)")
            return nil
        }
    }

    /// Check if the Apple ID credential is still valid
    func checkCredentialState() async -> Bool {
        guard let userId = keychain.get(.appleUserId) else {
            return false
        }

        let provider = ASAuthorizationAppleIDProvider()

        do {
            let state = try await provider.credentialState(forUserID: userId)
            switch state {
            case .authorized:
                return true
            case .revoked, .notFound:
                await signOut()
                return false
            case .transferred:
                // Handle account transfer if needed
                return false
            @unknown default:
                return false
            }
        } catch {
            logger.error("Failed to check credential state: \(error.localizedDescription)")
            return false
        }
    }

    // MARK: - Private Methods

    private func restoreAuthState() {
        // Check Firebase auth state first
        if let firebaseUser = Auth.auth().currentUser {
            logger.info("Restoring auth state from Firebase for user: \(firebaseUser.uid)")
            isSignedIn = true
            userEmail = firebaseUser.email ?? keychain.get(.userEmail)
            displayName = firebaseUser.displayName ?? keychain.get(.displayName)

            // Verify Apple credential is still valid in background
            Task {
                let isValid = await checkCredentialState()
                if !isValid {
                    logger.warning("Apple credential is no longer valid")
                }
            }
        } else if keychain.get(.appleUserId) != nil {
            // We have local credentials but no Firebase session - sign out to clean up
            logger.warning("Local credentials exist but no Firebase session - clearing state")
            keychain.clearAll()
        }
    }

    private func performSignIn(request: ASAuthorizationAppleIDRequest) async throws -> ASAuthorization {
        return try await withCheckedThrowingContinuation { continuation in
            let controller = ASAuthorizationController(authorizationRequests: [request])

            let delegate = SignInDelegate(continuation: continuation)
            controller.delegate = delegate
            controller.presentationContextProvider = delegate

            // Store delegate to prevent deallocation
            objc_setAssociatedObject(controller, "delegate", delegate, .OBJC_ASSOCIATION_RETAIN)

            controller.performRequests()
        }
    }

    private func handleAuthorizationResult(_ authorization: ASAuthorization) async throws {
        guard let appleIDCredential = authorization.credential as? ASAuthorizationAppleIDCredential else {
            throw AuthError.invalidCredential
        }

        // Store Apple User ID
        keychain.save(appleIDCredential.user, for: .appleUserId)

        // Store email (only provided on first sign in)
        if let email = appleIDCredential.email {
            keychain.save(email, for: .userEmail)
            userEmail = email
        } else {
            userEmail = keychain.get(.userEmail)
        }

        // Store name (only provided on first sign in)
        if let fullName = appleIDCredential.fullName {
            let name = PersonNameComponentsFormatter.localizedString(from: fullName, style: .default)
            if !name.isEmpty {
                keychain.save(name, for: .displayName)
                displayName = name
            }
        } else {
            displayName = keychain.get(.displayName)
        }

        // Get the identity token for Firebase authentication
        guard let identityToken = appleIDCredential.identityToken,
              let tokenString = String(data: identityToken, encoding: .utf8) else {
            throw AuthError.missingIdentityToken
        }

        guard let nonce = currentNonce else {
            throw AuthError.signInFailed(NSError(domain: "AuthService", code: -1, userInfo: [NSLocalizedDescriptionKey: "Missing nonce"]))
        }

        // Authenticate with Firebase using Apple credential
        let credential = OAuthProvider.appleCredential(
            withIDToken: tokenString,
            rawNonce: nonce,
            fullName: appleIDCredential.fullName
        )

        do {
            let authResult = try await Auth.auth().signIn(with: credential)
            logger.info("Firebase auth successful for user: \(authResult.user.uid)")
        } catch {
            logger.error("Firebase auth failed: \(error.localizedDescription)")
            throw AuthError.signInFailed(error)
        }

        isSignedIn = true
        logger.info("User signed in successfully")
    }

    // MARK: - Nonce Generation

    private func randomNonceString(length: Int = 32) -> String {
        precondition(length > 0)
        var randomBytes = [UInt8](repeating: 0, count: length)
        let errorCode = SecRandomCopyBytes(kSecRandomDefault, randomBytes.count, &randomBytes)
        if errorCode != errSecSuccess {
            fatalError("Unable to generate nonce. SecRandomCopyBytes failed with OSStatus \(errorCode)")
        }

        let charset: [Character] = Array("0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._")
        let nonce = randomBytes.map { byte in
            charset[Int(byte) % charset.count]
        }
        return String(nonce)
    }

    private func sha256(_ input: String) -> String {
        let inputData = Data(input.utf8)
        let hashedData = SHA256.hash(data: inputData)
        let hashString = hashedData.compactMap { String(format: "%02x", $0) }.joined()
        return hashString
    }
}

// MARK: - Error Types

extension AuthService {
    enum AuthError: LocalizedError {
        case invalidCredential
        case missingIdentityToken
        case signInCancelled
        case signInFailed(Error)

        var errorDescription: String? {
            switch self {
            case .invalidCredential:
                return "Invalid credential received from Apple"
            case .missingIdentityToken:
                return "No identity token received from Apple"
            case .signInCancelled:
                return "Sign in was cancelled"
            case .signInFailed(let error):
                return "Sign in failed: \(error.localizedDescription)"
            }
        }
    }
}

// MARK: - Sign In Delegate

private class SignInDelegate: NSObject, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    private let continuation: CheckedContinuation<ASAuthorization, Error>

    init(continuation: CheckedContinuation<ASAuthorization, Error>) {
        self.continuation = continuation
    }

    func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        // Get the key window for presentation
        guard let scene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
              let window = scene.windows.first else {
            fatalError("No window available for Sign In with Apple presentation")
        }
        return window
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        continuation.resume(returning: authorization)
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        if let authError = error as? ASAuthorizationError {
            switch authError.code {
            case .canceled:
                continuation.resume(throwing: AuthService.AuthError.signInCancelled)
            default:
                continuation.resume(throwing: AuthService.AuthError.signInFailed(error))
            }
        } else {
            continuation.resume(throwing: AuthService.AuthError.signInFailed(error))
        }
    }
}
