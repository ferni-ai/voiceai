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
    /// Talk, refused because the account is on the waitlist: the gate's first
    /// refusal (no details), then /api/waitlist/me says where they stand.
    case waitlist
    /// The call's other states (design audit P2 #20: never exercised by a
    /// scenario). Calling: the room never answers, so it stays "Calling…".
    case connecting
    /// Live, then the connection drops into "Reconnecting…" and stays there.
    case reconnecting
    /// Live, then the system takes the audio (a phone call): "On hold".
    case onHold
    /// Talk can't reach Ferni: the problem in words, and Try again.
    case failed

    static let current: UITestScenario? = value(after: "-FerniUITest").flatMap(UITestScenario.init(rawValue:))

    /// `-FerniReduceMotion` / `-FerniReduceTransparency`: XCUITest can't change
    /// the system settings, so these set the environment values the views read.
    static let reduceMotion = flag("-FerniReduceMotion")
    static let reduceTransparency = flag("-FerniReduceTransparency")
    /// `-FerniAuditFixture`: a deliberately faint, unlabelled line mid-screen,
    /// so AccessibilityAuditTests can prove its gate still fails on one.
    static let auditFixture = flag("-FerniAuditFixture")
    /// Store screenshots: a person who has talked before, with a team and notes
    /// (canned answers from a fake API, fake first names only).
    static let storeData = flag("-FerniStoreData")
    /// Store screenshots: dark mode, whatever the simulator is set to.
    static let dark = flag("-FerniDark")
    /// Store screenshots: the hour Home's greeting is written for.
    static let hour: Int? = value(after: "-FerniHour").flatMap(Int.init)

    static let config = FerniConfig(apiBaseURL: URL(string: "http://127.0.0.1:9")!)

    /// Every launch starts from nothing the last one left, with sounds off
    /// unless `-FerniSounds YES` (a test of Ferni's foley).
    @MainActor static func resetDefaults() {
        if let id = Bundle.main.bundleIdentifier { UserDefaults.standard.removePersistentDomain(forName: id) }
        UserDefaults.standard.set(flag("-FerniSounds"), forKey: CallFeedback.soundsKey)
        if storeData { UserDefaults.standard.set(true, forKey: "ferni.call.hasTalked") }
    }

    /// The notes behind What Ferni remembers, learned over the last two months
    /// (a journal needs dates: today, this week, this month, before that).
    private static var memories: String {
        let notes: [(id: String, content: String, kind: String, daysAgo: Double)] = [
            ("m1", "Walk before work, three mornings a week", "goal", 0.2),
            ("m6", "Sister Ana's birthday is Friday", "fact", 0.2),
            ("m5", "Has a dog called Biscuit", "fact", 3),
            ("m3", "Strong coffee, no sugar", "preference", 5),
            ("m7", "Finished the garden this month", "fact", 12),
            ("m2", "Read more fiction this winter", "goal", 20),
            ("m4", "Long walks with Biscuit", "preference", 41),
            ("m8", "Sunday evenings feel heavy before the week", "pattern", 60),
        ]
        let iso = ISO8601DateFormatter()
        let items = notes.map { n in
            #"{"id":"\#(n.id)","content":"\#(n.content)","type":"\#(n.kind)","sourceType":"persona_memory","learnedAt":"\#(iso.string(from: Date().addingTimeInterval(-n.daysAgo * 86_400)))"}"#
        }
        return #"{"memories":["# + items.joined(separator: ",") + "]}"
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
                body = memories
            } else if path.contains("/api/cognitive/memories/"), request.httpMethod == "DELETE" {
                body = "{}"
            } else {
                body = nil
            }
            let data = Data((body ?? "{}").utf8)
            let response = HTTPURLResponse(url: request.url!, statusCode: body == nil ? 404 : 200, httpVersion: nil, headerFields: nil)!
            return (data, response)
        })
    }

    /// The server a waitlisted account meets: /token refuses as #1953 does,
    /// /api/waitlist/me answers as #2033 does (a made-up referral code).
    static let waitlistAPI = FerniAPI(baseURL: config.apiBaseURL, idToken: { _ in "uitest" }, send: { request in
        let path = request.url?.path ?? ""
        let (status, body): (Int, String) = path.hasSuffix("/token")
            ? (403, #"{"error":"not_admitted","status":"pending","waitlisted":true,"message":"You're on the list."}"#)
            : path.hasSuffix("/api/waitlist/me")
            ? (200, #"{"status":"waiting","position":432,"wavesAway":4,"nextWaveAt":"2026-10-22T17:00:00.000Z","referralUrl":"https://ferni.ai/?ref=abc123-fern","referrals":{"verified":1,"creditedDays":3,"max":5},"admittedAt":null,"seatExpiresAt":null,"foundingMember":false,"foundingWave":null}"#)
            : (404, "{}")
        return (Data(body.utf8), HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!)
    })

    @MainActor static func callSession(avatar: AvatarModel, level: AudioLevelMeter) -> CallSession {
        let script: ScriptedRoom.Script = switch current {
        case .handoff: .handoff
        case .connecting: .neverAnswers
        case .reconnecting: .drops
        default: .garden
        }
        let fetchToken: CallSession.FetchToken = switch current {
        case .waitlist: CallTokens.fetcher(api: waitlistAPI)
        case .failed: { @Sendable _ in throw FerniAPIError.unreachable }
        default: { @Sendable _ in CallToken(token: "t", url: "wss://127.0.0.1:9", room: "ios-uitest", agentDispatched: true) }
        }
        return CallSession(
            fetchToken: fetchToken,
            makeRoom: { ScriptedRoom(script: script) },
            audio: SilentAudio(interrupted: current == .onHold),
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
    enum Script { case garden, handoff, neverAnswers, drops }
    let events: AsyncStream<RoomEvent>
    private let continuation: AsyncStream<RoomEvent>.Continuation
    private let script: Script

    init(script: Script = .garden) {
        self.script = script
        (events, continuation) = AsyncStream.makeStream(of: RoomEvent.self)
    }

    func connect(url: String, token: String) async throws {
        if script == .neverAnswers {
            // Calling, until the person cancels (or the session's own watchdog gives up).
            try await Task.sleep(for: .seconds(3600))
            return
        }
        continuation.yield(.agentJoined(attributes: ["lk.agent.state": "speaking"]))
        switch script {
        case .neverAnswers: break
        case .drops:
            say([(.you, "Long week. I finally finished the garden."),
                 (.ferni, "That's huge! What did you plant first?")])
            let continuation = continuation
            Task {
                try? await Task.sleep(for: .seconds(1.5))
                continuation.yield(.reconnecting)
            }
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

/// No audio session, no permission prompt. `interrupted`: 1.5 s in, the
/// system takes the audio (a phone call), and gives it back when asked.
private final class SilentAudio: CallAudio, @unchecked Sendable {
    let interruptions: AsyncStream<AudioInterruption>

    init(interrupted: Bool = false) {
        interruptions = AsyncStream { continuation in
            guard interrupted else { return }
            Task {
                try? await Task.sleep(for: .seconds(1.5))
                continuation.yield(.began)
            }
        }
    }

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
        var foley = 0
    }
}

/// Lines nobody could read (near-white on paper) in the middle of the screen,
/// where a scroll nudge can't carry them off an edge: one with no accessibility
/// label set (its words are all it has), one with an empty label. The audit
/// must fail on them (AccessibilityAuditTests.testTheGateStillFails).
struct AuditFixture: View {
    var body: some View {
        VStack(spacing: 12) {
            Text(verbatim: "faint words nobody can read")
            Text(verbatim: "faint and nameless").accessibilityLabel(Text(verbatim: ""))
        }
        .font(.body)
        .foregroundStyle(Color(white: 0.93))
        .padding(12)
        .background(Color(red: 0.98, green: 0.973, blue: 0.961))
        .allowsHitTesting(false)
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
        Color.clear
            .frame(width: 1, height: 1)
            .accessibilityElement()
            .accessibilityIdentifier("uitest.foley")
            .accessibilityLabel(Text(verbatim: "Test foley"))
            .accessibilityValue(Text(verbatim: "\(UITestScenario.Counters.shared.foley)"))
    }
}

extension View {
    /// The overrides and the probe; nothing outside a UI-test launch.
    @ViewBuilder func uiTestEnvironment() -> some View {
        if UITestScenario.current != nil {
            self
                .overlay(alignment: .topLeading) { UITestEnvironmentProbe() }
                .overlay { if UITestScenario.auditFixture { AuditFixture() } }
                .environment(\._accessibilityReduceMotion, UITestScenario.reduceMotion)
                .environment(\._accessibilityReduceTransparency, UITestScenario.reduceTransparency)
                .preferredColorScheme(UITestScenario.dark ? .dark : nil)
        } else {
            self
        }
    }
}
#endif
