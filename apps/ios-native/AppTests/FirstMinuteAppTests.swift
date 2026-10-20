import CryptoKit
import FerniKit
import UIKit
import XCTest
@testable import Ferni

/// Delight gap 3 in the app: the launch screen is the room, not a logo, and
/// the consent wording can't change without a new consent version.
@MainActor
final class FirstMinuteAppTests: XCTestCase {
    /// The HIG: a launch screen is nearly identical to the first screen. Ferni
    /// is drawn live, so the launch screen is just the room's colour.
    func testTheLaunchScreenIsTheRoomAndNotALogo() throws {
        let launch = try XCTUnwrap(Bundle.main.object(forInfoDictionaryKey: "UILaunchScreen") as? [String: Any])
        XCTAssertNil(launch["UIImageName"], "no logo flash before Ferni")
        XCTAssertEqual(launch["UIColorName"] as? String, "LaunchBackground")
        let room = try XCTUnwrap(UIColor(named: "LaunchBackground")).resolvedColor(with: UITraitCollection(userInterfaceStyle: .light))
        var (r, g, b, a) = (CGFloat(0), CGFloat(0), CGFloat(0), CGFloat(0))
        room.getRed(&r, green: &g, blue: &b, alpha: &a)
        XCTAssertEqual([r, g, b].map { Int(($0 * 255).rounded()) }, [0xFA, 0xF8, 0xF5], "the room's top colour (#faf8f5)")
    }

    /// Change the words people agree to, and the version must change with
    /// them, so everyone is asked again. Update both constants together.
    func testConsentWordingAndVersionChangeTogether() {
        let digest = SHA256.hash(data: Data(ConsentView.body.utf8)).map { String(format: "%02x", $0) }.joined()
        XCTAssertEqual(ConsentStore.currentVersion, "2026-10-20")
        XCTAssertEqual(digest.prefix(16), "806c867387abab74", "wording changed: bump ConsentStore.currentVersion, then update this digest")
    }

    /// Ferni speaks for himself throughout (design audit P2 #12: the provider
    /// sentence said "Ferni", the notes "I").
    func testConsentIsInFerniVoice() {
        XCTAssertTrue(ConsentView.body.hasPrefix("When we talk, your voice and what you say are sent to companies that help me hear, think and speak:"))
        XCTAssertTrue(ConsentView.body.contains("I keep notes from our talks so I can remember you."))
        XCTAssertFalse(ConsentView.body.contains("Ferni"), "no switching to \"Ferni\": \(ConsentView.body)")
        XCTAssertFalse(ConsentView.body.contains("so it can remember you"))
    }

    /// App Store 5.1.2(i): whatever the copy says later, it names every company
    /// the call's audio and words go to, and what they do with it.
    func testConsentNamesEveryProcessorAndWhatTheyDo() {
        for processor in ["Google (Gemini)", "Anthropic (Claude)", "Cartesia (speech)", "LiveKit (the call itself)"] {
            XCTAssertTrue(ConsentView.body.contains(processor), "the consent drops \(processor)")
        }
        XCTAssertTrue(ConsentView.body.contains("They process it to answer you."), "and what they do with it")
    }
}
