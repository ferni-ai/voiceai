import FirebaseAuth
import UIKit
import XCTest
@testable import Ferni

/// P0 2026-10-19: phone sign-in failed at "Text me a code" with Firebase
/// 17054 (ERROR_NOTIFICATION_NOT_FORWARDED). Before texting a code Firebase
/// sends itself a probe through the app delegate's remote-notification
/// method, and the app delegate didn't have one.
@MainActor
final class PhoneSignInForwardingTests: XCTestCase {
    func testTheAppDelegateHandsRemoteNotificationsOn() {
        let selector = #selector(UIApplicationDelegate.application(_:didReceiveRemoteNotification:fetchCompletionHandler:))
        XCTAssertTrue(FerniAppDelegate().responds(to: selector), "Firebase's probe needs somewhere to land")
    }

    /// The cause: Firebase was started in FerniApp.init, before UIApplication
    /// existed, so Auth never made its notification manager, and phone sign-in
    /// throws 17054 without one (PhoneAuthProvider.internalVerify). Started in
    /// didFinishLaunching, it has one. (Reads Auth's stored property by
    /// reflection: Firebase is pinned, and a rename fails here, loudly.)
    func testFirebaseAuthStartsWithWhatPhoneSignInNeeds() async throws {
        var manager: Any?
        for _ in 0..<30 {
            let field = Mirror(reflecting: Auth.auth()).children.first { $0.label == "notificationManager" }
            XCTAssertNotNil(field, "Auth has no notificationManager field any more: re-check phone sign-in")
            if let value = field?.value, case Optional<Any>.some(let unwrapped) = value as Any? {
                if String(describing: unwrapped) != "nil" { manager = unwrapped; break }
            }
            try await Task.sleep(for: .milliseconds(100))
        }
        XCTAssertNotNil(manager, "Auth started without its notification manager: phone sign-in would fail with 17054")
    }

    func testItAlwaysAnswers() {
        var result: UIBackgroundFetchResult?
        FerniAppDelegate().application(UIApplication.shared, didReceiveRemoteNotification: ["probe": true]) { result = $0 }
        XCTAssertEqual(result, .noData)
    }
}
