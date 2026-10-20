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
    /// Store screenshots: Ferni brings Maya in mid-call (the family table).
    case handoff
    /// Store screenshots: a call that just ended, with the "I'll remember" card.
    case remember

    static let current: UITestScenario? = value(after: "-FerniUITest").flatMap(UITestScenario.init(rawValue:))

    /// `-FerniReduceMotion` / `-FerniReduceTransparency`: XCUITest can't change
    /// the system settings, so these set the environment values the views read.
    static let reduceMotion = flag("-FerniReduceMotion")
    static let reduceTransparency = flag("-FerniReduceTransparency")
    /// Store screenshots: a person who has talked before, with a team and notes
    /// (canned answers from a fake API, fake first names only).
    static let storeData = flag("-FerniStoreData")
    /// Store screenshots: dark mode, whatever the simulator is set to.
    static let dark = flag("-FerniDark")
    /// Store screenshots: the hour Home's greeting is written for.
    static let hour: Int? = value(after: "-FerniHour").flatMap(Int.init)

    static let config = FerniConfig(apiBaseURL: URL(string: "http://127.0.0.1:9")!)

    /// Every launch starts from nothing the last one left, with sounds off.
    @MainActor static func resetDefaults() {
        if let id = Bundle.main.bundleIdentifier { UserDefaults.standard.removePersistentDomain(forName: id) }
        UserDefaults.standard.set(false, forKey: CallFeedback.soundsKey)
        if storeData { UserDefaults.standard.set(true, forKey: "ferni.call.hasTalked") }
    }

    /// The fake API behind `-FerniStoreData`: a team, the call's three
    /// remembered things, and notes. Anything else is a 404.
    static func api(baseURL: URL) -> FerniAPI {
        FerniAPI(baseURL: baseURL, idToken: { _ in "uitest" }, send: { request in
            let path = request.url?.path ?? ""
            let body: String?
            if path.hasSuffix("/api/relationship/team-unlocks") {
                body = #"{"unlockedMembers":["ferni","maya-santos","peter-john","alex-chen","jordan-taylor"],"members":[{"id":"nayan-patel","unlocked":false}]}"#
            } else if path.hasSuffix("/api/memories/from-call") {
                body = #"{"items":[{"id":"f1","subject":"you","detail":"Finished the garden. Tomatoes went in first"},{"id":"f2","subject":"Ana","detail":"her birthday is Friday"},{"id":"f3","subject":"you","detail":"Want to walk before work, three mornings a week"}]}"#
            } else if path.hasSuffix("/api/cognitive/memories") {
                body = #"{"memories":[{"id":"m1","content":"Walk before work, three mornings a week","type":"goal","sourceType":"persona_memory"},{"id":"m2","content":"Read more fiction this winter","type":"goal","sourceType":"persona_memory"},{"id":"m3","content":"Strong coffee, no sugar","type":"preference","sourceType":"persona_memory"},{"id":"m4","content":"Long walks with Biscuit","type":"preference","sourceType":"persona_memory"},{"id":"m5","content":"Has a dog called Biscuit","type":"fact","sourceType":"persona_memory"},{"id":"m6","content":"Sister Ana's birthday is Friday","type":"fact","sourceType":"persona_memory"},{"id":"m7","content":"Finished the garden this month","type":"fact","sourceType":"persona_memory"},{"id":"m8","content":"Sunday evenings feel heavy before the week","type":"pattern","sourceType":"persona_memory"}]}"#
            } else {
                body = nil
            }
            let data = Data((body ?? "{}").utf8)
            let response = HTTPURLResponse(url: request.url!, statusCode: body == nil ? 404 : 200, httpVersion: nil, headerFields: nil)!
            return (data, response)
        })
    }

    @MainActor static func callSession(avatar: AvatarModel, level: AudioLevelMeter) -> CallSession {
        CallSession(
            fetchToken: { _ in CallToken(token: "t", url: "wss://127.0.0.1:9", room: "ios-uitest", agentDispatched: true) },
            makeRoom: { ScriptedRoom(script: current == .handoff ? .handoff : .garden) },
            audio: SilentAudio(),
            avatar: avatar,
            agentLevel: level
        )
    }

    /// `-FerniAccount anonymous|needsSignIn`: an account that can sign in,
    /// with a stand-in for Firebase (any number; the code is 123456).
    @MainActor static func account() -> AccountStore? {
        guard current != nil, let kind = value(after: "-FerniAccount") else { return nil }
        let realBefore = kind == "needsSignIn"
        let backend = UITestAuthBackend(anonymous: kind == "anonymous")
        return AccountStore(backend: backend, memory: AccountMemory(get: { realBefore }, set: { _ in }))
    }

    private static func value(after name: String) -> String? {
        let args = ProcessInfo.processInfo.arguments
        guard let i = args.firstIndex(of: name), i + 1 < args.count else { return nil }
        return args[i + 1]
    }

    private static func flag(_ name: String) -> Bool { value(after: name) == "YES" }
}

/// Firebase's stand-in for UI tests: signs in to "uitest-real" with code 123456.
private final class UITestAuthBackend: AuthBackend, @unchecked Sendable {
    private var user: AccountUser?

    init(anonymous: Bool) {
        user = anonymous ? AccountUser(uid: "uitest-anon", isAnonymous: true) : nil
    }

    func currentUser() async -> AccountUser? { user }
    func signInAnonymously() async throws -> AccountUser { throw URLError(.notConnectedToInternet) }
    func idToken(forceRefresh: Bool) async throws -> String? { user.map { "uitest-\($0.uid)" } }
    func sendPhoneCode(to phoneNumber: String) async throws -> String { "uitest-verification" }
    func linkOrSignIn(_ credential: SignInCredential) async throws -> SignInResult {
        if case .phone(_, let code) = credential, code != "123456" { throw SignInError.invalidCode }
        user = AccountUser(uid: "uitest-real", isAnonymous: false, providerIDs: ["phone"])
        return SignInResult(user: user!, leftBehind: nil)
    }
    func signOut() async throws { user = nil }
}

/// Ferni arrives speaking and the call stays up until it's ended.
private final class ScriptedRoom: VoiceRoom, @unchecked Sendable {
    enum Script { case garden, handoff }
    let events: AsyncStream<RoomEvent>
    private let continuation: AsyncStream<RoomEvent>.Continuation
    private let script: Script

    init(script: Script = .garden) {
        self.script = script
        (events, continuation) = AsyncStream.makeStream(of: RoomEvent.self)
    }

    func connect(url: String, token: String) async throws {
        continuation.yield(.agentJoined(attributes: ["lk.agent.state": "speaking"]))
        switch script {
        case .garden:
            say([(.you, "Long week. I finally finished the garden."),
                 (.ferni, "That's huge! What did you plant first?")])
        case .handoff:
            say([(.you, "I keep saying I'll walk before work."),
                 (.ferni, "Maya's brilliant at this. Let me bring her in.")])
            let continuation = continuation
            Task {
                try? await Task.sleep(for: .seconds(3))
                continuation.yield(.data(Data(#"{"type":"handoff_started","newAgent":"maya-santos"}"#.utf8)))
                try? await Task.sleep(for: .seconds(2.5))
                continuation.yield(.data(Data(#"{"type":"handoff_complete","target":"maya-santos"}"#.utf8)))
                try? await Task.sleep(for: .seconds(1))
                continuation.yield(.caption(CaptionChunk(streamID: "s9", segmentID: "g9", speaker: .ferni,
                    text: "Hi! Three mornings a week, starting small. Which days?", isFinal: true)))
            }
        }
    }

    private func say(_ lines: [(CaptionChunk.Speaker, String)]) {
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
        var notices = 0
        var startles = 0
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
        Color.clear
            .frame(width: 1, height: 1)
            .accessibilityElement()
            .accessibilityIdentifier("uitest.notices")
            .accessibilityLabel(Text(verbatim: "Test notices"))
            .accessibilityValue(Text(verbatim: "\(UITestScenario.Counters.shared.notices)"))
        Color.clear
            .frame(width: 1, height: 1)
            .accessibilityElement()
            .accessibilityIdentifier("uitest.startles")
            .accessibilityLabel(Text(verbatim: "Test startles"))
            .accessibilityValue(Text(verbatim: "\(UITestScenario.Counters.shared.startles)"))
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
                .preferredColorScheme(UITestScenario.dark ? .dark : nil)
        } else {
            self
        }
    }
}
#endif
