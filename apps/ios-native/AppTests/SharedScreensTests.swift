import WidgetKit
import XCTest
@testable import Ferni

/// HomeView readiness: what Ferni shows and does on shared screens (Apple
/// HomeView, CarPlay), checked against what the system actually reads (the
/// built App Intents metadata and the project's widget target).
final class SharedScreensTests: XCTestCase {
    /// Small widgets reach shared screens; only the medium one (an iPhone or
    /// iPad's own Home Screen) has Talk.
    func testOnlyTheMediumWidgetOffersTalk() {
        XCTAssertFalse(SharedScreens.widgetOffersTalk(.systemSmall))
        XCTAssertTrue(SharedScreens.widgetOffersTalk(.systemMedium))
        XCTAssertFalse(SharedScreens.widgetOffersTalk(.systemLarge))
    }

    private struct Metadata: Decodable {
        struct Action: Decodable { var authenticationPolicy: Int; var supportedModes: Int?; var outputFlags: Int; var outputType: String? }
        struct Phrase: Decodable { var key: String }
        struct Shortcut: Decodable { var actionIdentifier: String; var phraseTemplates: [Phrase] }
        var actions: [String: Action]
        var autoShortcuts: [Shortcut]
    }

    private func metadata(_ bundle: URL) throws -> Metadata {
        let url = bundle.appending(path: "Metadata.appintents/extract.actionsdata")
        return try JSONDecoder().decode(Metadata.self, from: Data(contentsOf: url))
    }

    /// IntentAuthenticationPolicy as the metadata stores it (declaration order).
    private let requiresLocalDeviceAuthentication = 2

    /// Every intent that starts a call asks the phone's owner to unlock it
    /// when it's asked from another device, in the app and in the widget
    /// extension (whose Talk and Control Center button run there).
    func testACallFromAnotherDeviceNeedsTheOwnersUnlock() throws {
        let app = try metadata(Bundle.main.bundleURL)
        for id in ["TalkIntent", "TalkToTeammateIntent"] {
            XCTAssertEqual(app.actions[id]?.authenticationPolicy, requiresLocalDeviceAuthentication, id)
        }
        let widget = try metadata(try XCTUnwrap(Bundle.main.builtInPlugInsURL).appending(path: "FerniLive.appex"))
        XCTAssertEqual(widget.actions["TalkIntent"]?.authenticationPolicy, requiresLocalDeviceAuthentication)
    }

    /// The phrases Siri offers (on HomeView too): "Talk to Ferni", "Call
    /// Ferni", "Talk to Maya on Ferni". Nothing comes back to show or say:
    /// no dialog, no snippet, no value.
    func testSiriOffersTheTalkPhrasesAndSaysNothingPersonal() throws {
        let app = try metadata(Bundle.main.bundleURL)
        XCTAssertEqual(app.autoShortcuts.map(\.actionIdentifier), ["TalkIntent"])
        XCTAssertEqual(app.autoShortcuts.first?.phraseTemplates.map(\.key),
                       ["Talk to ${applicationName}", "Call ${applicationName}", "Talk to ${teammate} on ${applicationName}"])
        for (id, action) in app.actions {
            XCTAssertEqual(action.outputFlags, 0, "\(id) returns something to show")
            XCTAssertNil(action.outputType, id)
        }
    }

    /// The widget extension can't read anything personal: it links only
    /// FerniDesign and has no entitlements (no shared app group).
    func testNothingPersonalCanReachTheWidget() throws {
        let yml = URL(fileURLWithPath: #filePath).deletingLastPathComponent().appending(path: "../project.yml").standardized
        guard let text = try? String(contentsOf: yml, encoding: .utf8) else { throw XCTSkip("project.yml not reachable") }
        let target = try XCTUnwrap(text.components(separatedBy: "\n  FerniLive:").dropFirst().first)
            .components(separatedBy: "\n  # ").first ?? ""
        XCTAssertTrue(target.contains("dependencies:\n      - package: FerniDesign\n    info:"), "only FerniDesign")
        XCTAssertFalse(target.contains("entitlements"))
        XCTAssertFalse(target.contains("FerniKit"))
    }
}
