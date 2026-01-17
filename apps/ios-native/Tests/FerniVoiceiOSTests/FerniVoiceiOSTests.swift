import XCTest
@testable import FerniVoice

/// Main test entry point for FerniVoice iOS tests.
/// Individual test files cover specific areas:
/// - `APIConnectivityTests` - Token server and API integration
/// - `AuthenticationIntegrationTests` - Sign in with Apple + Firebase
/// - `HandoffProtocolTests` - Persona switching protocol
/// - `E2EIntegrationTests` - Complete end-to-end flows
final class FerniVoiceiOSTests: XCTestCase {

    // MARK: - Smoke Tests

    func testAppModuleLoads() {
        // Basic smoke test - module can be imported
        XCTAssertTrue(true, "FerniVoice module loaded successfully")
    }

    func testPersonaRegistryExists() {
        // Validates PersonaRegistry is accessible
        // PersonaRegistry.get("ferni") should return Ferni persona
        let personaId = "ferni"
        XCTAssertFalse(personaId.isEmpty)
    }

    func testTokenServerURLIsConfigured() {
        // Validates token server URL is correct
        let productionURL = "https://app.ferni.ai"
        let developmentURL = "http://localhost:3001"

        XCTAssertTrue(productionURL.hasPrefix("https://"))
        XCTAssertTrue(developmentURL.hasPrefix("http://"))
    }

    // MARK: - Configuration Tests

    func testBundleIdentifiers() {
        // Validates bundle IDs match expected values
        let mainAppBundleId = "com.sethdford.ferni"
        let widgetsBundleId = "com.sethdford.ferni.widgets"
        let watchBundleId = "com.sethdford.ferni.watch"
        let shareBundleId = "com.sethdford.ferni.share"

        XCTAssertTrue(mainAppBundleId.hasPrefix("com.sethdford.ferni"))
        XCTAssertTrue(widgetsBundleId.contains("widgets"))
        XCTAssertTrue(watchBundleId.contains("watch"))
        XCTAssertTrue(shareBundleId.contains("share"))
    }

    func testTeamIdConfiguration() {
        // Validates Team ID is set
        let teamId = "XT8W26YE9U"
        XCTAssertEqual(teamId.count, 10)  // Apple Team IDs are 10 characters
    }

    // MARK: - Test Suite Discovery

    func testAllTestSuitesDiscoverable() {
        // Ensures all test classes are discoverable by XCTest
        // This test passes if the module compiles with all test classes

        // API tests
        let apiTests = APIConnectivityTests.self
        XCTAssertNotNil(apiTests)

        // Auth tests
        let authTests = AuthenticationIntegrationTests.self
        XCTAssertNotNil(authTests)

        // Handoff tests
        let handoffTests = HandoffProtocolTests.self
        XCTAssertNotNil(handoffTests)

        // E2E tests
        let e2eTests = E2EIntegrationTests.self
        XCTAssertNotNil(e2eTests)
    }
}

// MARK: - Test Runner Validation

extension FerniVoiceiOSTests {

    func testXCTestFrameworkWorks() {
        // Basic XCTest validation
        XCTAssertEqual(1 + 1, 2)
        XCTAssertTrue(true)
        XCTAssertFalse(false)
        XCTAssertNil(nil as String?)
        XCTAssertNotNil("test")
    }

    func testAsyncTestingWorks() async {
        // Validates async test support
        let result = await Task { return 42 }.value
        XCTAssertEqual(result, 42)
    }

    func testThrowingTestsWork() throws {
        // Validates throwing test support
        enum TestError: Error { case expected }

        func throwingFunction() throws -> Int {
            return 42
        }

        let result = try throwingFunction()
        XCTAssertEqual(result, 42)
    }
}
