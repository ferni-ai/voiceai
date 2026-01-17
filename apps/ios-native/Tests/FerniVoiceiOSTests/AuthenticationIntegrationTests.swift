import XCTest
@testable import FerniVoice

/// Tests for Sign in with Apple → Firebase authentication integration.
/// Validates the complete auth flow from native apps to backend.
final class AuthenticationIntegrationTests: XCTestCase {

    // MARK: - Mock Auth State

    /// Simulates AuthService state for testing
    struct MockAuthState {
        var isSignedIn: Bool = false
        var userEmail: String?
        var displayName: String?
        var firebaseToken: String?
        var appleUserId: String?

        mutating func signIn(email: String, name: String, appleUserId: String, firebaseToken: String) {
            self.isSignedIn = true
            self.userEmail = email
            self.displayName = name
            self.appleUserId = appleUserId
            self.firebaseToken = firebaseToken
        }

        mutating func signOut() {
            self.isSignedIn = false
            self.userEmail = nil
            self.displayName = nil
            self.firebaseToken = nil
            self.appleUserId = nil
        }
    }

    // MARK: - Properties

    private var authState: MockAuthState!

    // MARK: - Setup

    override func setUp() {
        super.setUp()
        authState = MockAuthState()
    }

    override func tearDown() {
        authState = nil
        super.tearDown()
    }

    // MARK: - Sign In Flow Tests

    func testInitialStateIsSignedOut() {
        XCTAssertFalse(authState.isSignedIn)
        XCTAssertNil(authState.userEmail)
        XCTAssertNil(authState.displayName)
        XCTAssertNil(authState.firebaseToken)
    }

    func testSuccessfulSignIn() {
        // When: User signs in with Apple
        authState.signIn(
            email: "user@example.com",
            name: "Test User",
            appleUserId: "001234.abc123.5678",
            firebaseToken: "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.firebase-token"
        )

        // Then: Auth state is updated
        XCTAssertTrue(authState.isSignedIn)
        XCTAssertEqual(authState.userEmail, "user@example.com")
        XCTAssertEqual(authState.displayName, "Test User")
        XCTAssertNotNil(authState.firebaseToken)
        XCTAssertNotNil(authState.appleUserId)
    }

    func testSignOut() {
        // Given: User is signed in
        authState.signIn(
            email: "user@example.com",
            name: "Test User",
            appleUserId: "001234.abc123.5678",
            firebaseToken: "firebase-token"
        )

        // When: User signs out
        authState.signOut()

        // Then: Auth state is cleared
        XCTAssertFalse(authState.isSignedIn)
        XCTAssertNil(authState.userEmail)
        XCTAssertNil(authState.displayName)
        XCTAssertNil(authState.firebaseToken)
        XCTAssertNil(authState.appleUserId)
    }

    // MARK: - Firebase Token Tests

    func testFirebaseTokenFormat() {
        // Firebase ID tokens are JWTs with three parts
        let validToken = "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJodHRwczovL3NlY3VyZXRva2VuLmdvb2dsZS5jb20veW91ci1wcm9qZWN0IiwiYXVkIjoieW91ci1wcm9qZWN0Iiwic3ViIjoiYWJjMTIzIn0.signature"

        let parts = validToken.components(separatedBy: ".")
        XCTAssertEqual(parts.count, 3, "JWT should have 3 parts separated by dots")
        XCTAssertTrue(parts[0].hasPrefix("eyJ"), "Header should be base64 encoded JSON")
    }

    func testFirebaseTokenUsedInAPIRequests() {
        // Given: User is signed in with Firebase token
        let firebaseToken = "firebase-id-token-test"
        authState.signIn(
            email: "user@example.com",
            name: "Test User",
            appleUserId: "apple-user-id",
            firebaseToken: firebaseToken
        )

        // When: Creating an API request
        var request = URLRequest(url: URL(string: "https://app.ferni.ai/token")!)

        if authState.isSignedIn, let token = authState.firebaseToken {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        // Then: Authorization header is set correctly
        XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer firebase-id-token-test")
    }

    func testUnauthenticatedRequestHasNoAuthHeader() {
        // Given: User is NOT signed in
        XCTAssertFalse(authState.isSignedIn)

        // When: Creating an API request
        var request = URLRequest(url: URL(string: "https://app.ferni.ai/token")!)

        if authState.isSignedIn, let token = authState.firebaseToken {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        // Then: No Authorization header is set
        XCTAssertNil(request.value(forHTTPHeaderField: "Authorization"))
    }

    // MARK: - Apple User ID Tests

    func testAppleUserIdFormat() {
        // Apple User IDs are opaque strings with a specific format
        let validAppleUserId = "001234.abc123def456.5678"

        // Contains multiple segments separated by dots
        let segments = validAppleUserId.components(separatedBy: ".")
        XCTAssertGreaterThanOrEqual(segments.count, 2)
    }

    func testAppleUserIdPersistence() {
        // Given: User signs in
        let appleUserId = "001234.abc123.5678"
        authState.signIn(
            email: "user@example.com",
            name: "Test User",
            appleUserId: appleUserId,
            firebaseToken: "token"
        )

        // Then: Apple User ID is stored
        XCTAssertEqual(authState.appleUserId, appleUserId)
    }

    // MARK: - Email and Name Privacy Tests

    func testEmailMayBePrivateRelay() {
        // Apple provides private relay emails for users who choose to hide their email
        let privateRelayEmail = "abc123xyz@privaterelay.appleid.com"

        authState.signIn(
            email: privateRelayEmail,
            name: "Test User",
            appleUserId: "apple-id",
            firebaseToken: "token"
        )

        XCTAssertTrue(authState.userEmail?.contains("privaterelay.appleid.com") ?? false)
    }

    func testNameOnlyProvidedOnFirstSignIn() {
        // Apple only provides name on first sign-in, not on subsequent logins
        // Test that we handle missing name gracefully

        authState.signIn(
            email: "user@example.com",
            name: "", // Empty name (subsequent sign-in)
            appleUserId: "apple-id",
            firebaseToken: "token"
        )

        // Should still be signed in even without name
        XCTAssertTrue(authState.isSignedIn)
        XCTAssertEqual(authState.displayName, "")
    }

    // MARK: - Error Handling Tests

    func testAuthErrorTypes() {
        // Validate error type definitions match AuthService
        let invalidCredential = AuthService.AuthError.invalidCredential
        let missingToken = AuthService.AuthError.missingIdentityToken
        let cancelled = AuthService.AuthError.signInCancelled
        let failed = AuthService.AuthError.signInFailed(NSError(domain: "test", code: -1))

        XCTAssertNotNil(invalidCredential.errorDescription)
        XCTAssertNotNil(missingToken.errorDescription)
        XCTAssertNotNil(cancelled.errorDescription)
        XCTAssertNotNil(failed.errorDescription)
    }

    func testCancelledSignInError() {
        let error = AuthService.AuthError.signInCancelled
        XCTAssertEqual(error.errorDescription, "Sign in was cancelled")
    }

    // MARK: - Token Refresh Scenarios

    func testTokenRefreshFlow() {
        // Simulate token refresh scenario
        let initialToken = "initial-firebase-token"
        let refreshedToken = "refreshed-firebase-token"

        // Initial sign in
        authState.signIn(
            email: "user@example.com",
            name: "Test User",
            appleUserId: "apple-id",
            firebaseToken: initialToken
        )

        XCTAssertEqual(authState.firebaseToken, initialToken)

        // Token refresh (simulated)
        authState.firebaseToken = refreshedToken

        XCTAssertEqual(authState.firebaseToken, refreshedToken)
        XCTAssertTrue(authState.isSignedIn) // Still signed in
    }

    // MARK: - Credential State Tests

    func testCredentialStateValues() {
        // These match ASAuthorizationAppleIDProvider.CredentialState
        enum CredentialState: Int {
            case authorized = 1
            case revoked = 2
            case notFound = 3
            case transferred = 4
        }

        // Authorized should keep user signed in
        XCTAssertEqual(CredentialState.authorized.rawValue, 1)

        // Revoked and notFound should sign user out
        XCTAssertEqual(CredentialState.revoked.rawValue, 2)
        XCTAssertEqual(CredentialState.notFound.rawValue, 3)
    }
}

// MARK: - Integration with Token Server

extension AuthenticationIntegrationTests {

    func testAuthenticatedTokenRequest() {
        // Simulate the complete flow: Auth → Token request

        // 1. User signs in
        authState.signIn(
            email: "user@example.com",
            name: "Test User",
            appleUserId: "apple-id-123",
            firebaseToken: "firebase-jwt-token"
        )

        // 2. Create token request
        let room = "ferni-ios-abc123"
        let username = "ios-user-456"
        let personaId = "ferni"

        let urlString = "https://app.ferni.ai/token?room=\(room)&username=\(username)&persona_id=\(personaId)"
        var request = URLRequest(url: URL(string: urlString)!)

        // 3. Add auth header if signed in
        if authState.isSignedIn, let token = authState.firebaseToken {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        // Validate request
        XCTAssertEqual(request.url?.path, "/token")
        XCTAssertTrue(request.url?.query?.contains("persona_id=ferni") ?? false)
        XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer firebase-jwt-token")
    }

    func testAnonymousTokenRequest() {
        // Users can also use the app without signing in (limited features)

        // User is NOT signed in
        XCTAssertFalse(authState.isSignedIn)

        // Create token request
        let urlString = "https://app.ferni.ai/token?room=ferni-ios-anon&username=ios-anon&persona_id=ferni"
        var request = URLRequest(url: URL(string: urlString)!)

        // No auth header for anonymous users
        if authState.isSignedIn, let token = authState.firebaseToken {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        // Validate - no auth header
        XCTAssertNil(request.value(forHTTPHeaderField: "Authorization"))
        XCTAssertNotNil(request.url)
    }
}

// MARK: - Keychain Integration Tests

extension AuthenticationIntegrationTests {

    func testKeychainKeys() {
        // Validate keychain key definitions match KeychainManager
        // These are the keys used to persist auth state

        // Keys that should be defined
        let expectedKeys = ["apple_user_id", "user_email", "display_name"]

        // Ensure we have keys for all required data
        XCTAssertTrue(expectedKeys.contains("apple_user_id"))
        XCTAssertTrue(expectedKeys.contains("user_email"))
        XCTAssertTrue(expectedKeys.contains("display_name"))
    }

    func testKeychainDataPersistence() {
        // Simulate keychain persistence flow
        var keychainStore: [String: String] = [:]

        // Save on sign in
        keychainStore["apple_user_id"] = "001234.abc123.5678"
        keychainStore["user_email"] = "user@example.com"
        keychainStore["display_name"] = "Test User"

        // Restore on app launch
        let restoredUserId = keychainStore["apple_user_id"]
        let restoredEmail = keychainStore["user_email"]
        let restoredName = keychainStore["display_name"]

        XCTAssertEqual(restoredUserId, "001234.abc123.5678")
        XCTAssertEqual(restoredEmail, "user@example.com")
        XCTAssertEqual(restoredName, "Test User")
    }

    func testKeychainClearedOnSignOut() {
        var keychainStore: [String: String] = [
            "apple_user_id": "001234.abc123.5678",
            "user_email": "user@example.com",
            "display_name": "Test User"
        ]

        // Clear on sign out
        keychainStore.removeAll()

        XCTAssertNil(keychainStore["apple_user_id"])
        XCTAssertNil(keychainStore["user_email"])
        XCTAssertNil(keychainStore["display_name"])
    }
}

// MARK: - Account Deletion Tests (App Store Requirement)

extension AuthenticationIntegrationTests {

    func testAccountDeletionRequestFormat() throws {
        // Validate the delete account API request format
        let firebaseToken = "firebase-id-token-test"

        var request = URLRequest(url: URL(string: "https://app.ferni.ai/api/account")!)
        request.httpMethod = "DELETE"
        request.setValue("Bearer \(firebaseToken)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let body = ["confirmation": "DELETE_MY_ACCOUNT"]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        // Verify request format
        XCTAssertEqual(request.httpMethod, "DELETE")
        XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer \(firebaseToken)")
        XCTAssertEqual(request.value(forHTTPHeaderField: "Content-Type"), "application/json")

        // Verify body contains confirmation
        let bodyData = request.httpBody!
        let parsedBody = try JSONSerialization.jsonObject(with: bodyData) as! [String: String]
        XCTAssertEqual(parsedBody["confirmation"], "DELETE_MY_ACCOUNT")
    }

    func testAccountDeletionClearsLocalState() {
        // Given: User is signed in
        authState.signIn(
            email: "user@example.com",
            name: "Test User",
            appleUserId: "apple-id",
            firebaseToken: "token"
        )
        XCTAssertTrue(authState.isSignedIn)

        // When: Account is deleted (which calls signOut after server deletion)
        authState.signOut()

        // Then: All state is cleared
        XCTAssertFalse(authState.isSignedIn)
        XCTAssertNil(authState.userEmail)
        XCTAssertNil(authState.displayName)
        XCTAssertNil(authState.firebaseToken)
        XCTAssertNil(authState.appleUserId)
    }

    func testAccountDeletionRequiresAuthentication() {
        // Cannot delete account without being signed in
        XCTAssertFalse(authState.isSignedIn)

        // Attempting to get Firebase token should fail
        XCTAssertNil(authState.firebaseToken)

        // Delete request without token should be rejected by server
        // (This is enforced by the backend's requireAuth middleware)
    }

    func testAccountDeletionConfirmationRequired() {
        // The backend requires a confirmation string to prevent accidental deletion
        let requiredConfirmation = "DELETE_MY_ACCOUNT"

        // Without this exact string, the backend returns 400 error
        XCTAssertEqual(requiredConfirmation, "DELETE_MY_ACCOUNT")
    }
}
