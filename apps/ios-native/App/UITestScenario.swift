#if DEBUG
import FerniKit
import FerniVoice
import Foundation
import SwiftUI

/// Debug builds only: FerniUITests launch the app with `-FerniUITest <scenario>`
/// to reach a screen with no network, no account, no microphone and no sound.
/// The API points at a closed local port, Firebase isn't configured, and a call
/// runs against a scripted room. Release builds don't contain any of this.
enum UITestScenario: String {
    /// Home, at rest, before any call.
    case home
    /// The consent screen that comes before a first call.
    case consent
    /// Settings, over Home.
    case settings
    /// A live call: Ferni speaking, with a line of captions each.
    case call

    static let current: UITestScenario? = value(after: "-FerniUITest").flatMap(UITestScenario.init(rawValue:))

    /// `-FerniReduceMotion` / `-FerniReduceTransparency`: XCUITest can't change
    /// the system settings, so these set the environment values the views read.
    static let reduceMotion = flag("-FerniReduceMotion")
    static let reduceTransparency = flag("-FerniReduceTransparency")

    static let config = FerniConfig(apiBaseURL: URL(string: "http://127.0.0.1:9")!)

    /// Every launch starts from nothing the last one left, with sounds off.
    @MainActor static func resetDefaults() {
        if let id = Bundle.main.bundleIdentifier { UserDefaults.standard.removePersistentDomain(forName: id) }
        UserDefaults.standard.set(false, forKey: CallFeedback.soundsKey)
    }

    @MainActor static func callSession(avatar: AvatarModel, level: AudioLevelMeter) -> CallSession {
        CallSession(
            fetchToken: { _ in CallToken(token: "t", url: "wss://127.0.0.1:9", room: "ios-uitest", agentDispatched: true) },
            makeRoom: { ScriptedRoom() },
            audio: SilentAudio(),
            avatar: avatar,
            agentLevel: level
        )
    }

    private static func value(after name: String) -> String? {
        let args = ProcessInfo.processInfo.arguments
        guard let i = args.firstIndex(of: name), i + 1 < args.count else { return nil }
        return args[i + 1]
    }

    private static func flag(_ name: String) -> Bool { value(after: name) == "YES" }
}

/// Ferni arrives speaking and the call stays up until it's ended.
private final class ScriptedRoom: VoiceRoom, @unchecked Sendable {
    let events: AsyncStream<RoomEvent>
    private let continuation: AsyncStream<RoomEvent>.Continuation

    init() { (events, continuation) = AsyncStream.makeStream(of: RoomEvent.self) }

    func connect(url: String, token: String) async throws {
        continuation.yield(.agentJoined(attributes: ["lk.agent.state": "speaking"]))
        let lines: [(CaptionChunk.Speaker, String)] = [
            (.you, "Long week. I finally finished the garden."),
            (.ferni, "That's huge! What did you plant first?"),
        ]
        for (i, line) in lines.enumerated() {
            continuation.yield(.caption(CaptionChunk(streamID: "s\(i)", segmentID: "g\(i)", speaker: line.0, text: line.1, isFinal: true)))
        }
    }

    func setMicrophone(enabled: Bool) async throws {}
    func send(_ data: Data) async throws {}
    func disconnect() async { continuation.finish() }
}

/// No audio session, no permission prompt.
private final class SilentAudio: CallAudio, @unchecked Sendable {
    let interruptions = AsyncStream<AudioInterruption> { _ in }
    func requestMicrophone() async -> Bool { true }
    func activate(systemOwned: Bool) throws {}
    func deactivate(systemOwned: Bool) {}
    func systemAudio(active: Bool) {}
}

extension UITestScenario {
    /// What happened in this launch, for the probe.
    @MainActor @Observable final class Counters {
        static let shared = Counters()
        var touches = 0
    }
}

/// Reports the accessibility settings the views actually received, so a UI
/// test can tell an override that took effect from one that didn't.
struct UITestEnvironmentProbe: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency

    var body: some View {
        Color.clear
            .frame(width: 1, height: 1)
            .accessibilityElement()
            .accessibilityIdentifier("uitest.environment")
            // Verbatim: test-only text stays out of the String Catalog.
            .accessibilityLabel(Text(verbatim: "Test settings"))
            .accessibilityValue(Text(verbatim: "reduceMotion=\(reduceMotion) reduceTransparency=\(reduceTransparency)"))
        Color.clear
            .frame(width: 1, height: 1)
            .accessibilityElement()
            .accessibilityIdentifier("uitest.touches")
            .accessibilityLabel(Text(verbatim: "Test touches"))
            .accessibilityValue(Text(verbatim: "\(UITestScenario.Counters.shared.touches)"))
    }
}

extension View {
    /// The overrides and the probe; nothing outside a UI-test launch.
    @ViewBuilder func uiTestEnvironment() -> some View {
        if UITestScenario.current != nil {
            self
                .overlay(alignment: .topLeading) { UITestEnvironmentProbe() }
                .environment(\._accessibilityReduceMotion, UITestScenario.reduceMotion)
                .environment(\._accessibilityReduceTransparency, UITestScenario.reduceTransparency)
        } else {
            self
        }
    }
}
#endif
