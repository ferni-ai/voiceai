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

    func testItAlwaysAnswers() {
        var result: UIBackgroundFetchResult?
        FerniAppDelegate().application(UIApplication.shared, didReceiveRemoteNotification: ["probe": true]) { result = $0 }
        XCTAssertEqual(result, .noData)
    }
}
