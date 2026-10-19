import FerniLink
import SwiftUI
import WatchConnectivity

/// Ferni on the wrist: a remote for the call on your iPhone.
@main
struct FerniWatchApp: App {
    @State private var link = PhoneLink.shared

    init() {
        PhoneLink.shared.start()
        TalkOnPhoneIntent.handler = { PhoneLink.shared.send(.talk) }
    }

    var body: some Scene {
        WindowGroup { RemoteView(link: link) }
    }
}

/// The connection to the phone: commands out, the call's state in.
@MainActor
@Observable
final class PhoneLink: NSObject {
    static let shared = PhoneLink()

    private(set) var state = RemoteState()
    private(set) var reachable = false
    private(set) var problem: String?

    func start() {
        guard WCSession.isSupported() else { return }
        WCSession.default.delegate = self
        WCSession.default.activate()
    }

    func send(_ command: RemoteCommand) {
        let session = WCSession.default
        guard session.activationState == .activated, session.isReachable else {
            problem = String(localized: "Open Ferni on your iPhone")
            return
        }
        problem = nil
        session.sendMessage(command.message, replyHandler: nil) { _ in
            Task { @MainActor in PhoneLink.shared.problem = String(localized: "Couldn't reach your iPhone") }
        }
    }

    fileprivate func update(state: RemoteState) { self.state = state }
    fileprivate func update(reachable: Bool) { self.reachable = reachable }
}

extension PhoneLink: WCSessionDelegate {
    nonisolated func session(_ session: WCSession, activationDidCompleteWith state: WCSessionActivationState, error: (any Error)?) {
        let remote = RemoteState(context: session.receivedApplicationContext), reachable = session.isReachable
        Task { @MainActor in
            PhoneLink.shared.update(state: remote)
            PhoneLink.shared.update(reachable: reachable)
        }
    }

    nonisolated func session(_ session: WCSession, didReceiveApplicationContext context: [String: Any]) {
        let remote = RemoteState(context: context)
        Task { @MainActor in PhoneLink.shared.update(state: remote) }
    }

    nonisolated func sessionReachabilityDidChange(_ session: WCSession) {
        let reachable = session.isReachable
        Task { @MainActor in PhoneLink.shared.update(reachable: reachable) }
    }
}

/// Who's on and what's happening; Talk, or Mute and End. Double tap is the
/// main action: Mute in a call, Talk otherwise.
struct RemoteView: View {
    let link: PhoneLink

    var body: some View {
        let state = link.state
        VStack(spacing: 8) {
            Text(state.name)
                .font(.title3.bold())
            Text(Self.line(state))
                .font(.footnote)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            if state.inCall {
                HStack {
                    Button {
                        link.send(.mute)
                    } label: {
                        Image(systemName: state.muted ? "mic.slash.fill" : "mic.fill")
                    }
                    .accessibilityLabel(state.muted ? "Unmute" : "Mute")
                    .handGestureShortcut(.primaryAction)
                    .disabled(state.phase != .live)
                    Button(role: .destructive) {
                        link.send(.end)
                    } label: {
                        Image(systemName: "phone.down.fill")
                    }
                    .accessibilityLabel("End call")
                    .tint(.red)
                }
            } else {
                Button {
                    link.send(.talk)
                } label: {
                    Label("Talk", systemImage: "waveform")
                }
                .buttonStyle(.borderedProminent)
                .tint(Color(red: 0.29, green: 0.40, blue: 0.25))
                .handGestureShortcut(.primaryAction)
            }
            if let problem = link.problem {
                Text(problem).font(.caption2).foregroundStyle(.secondary)
            }
        }
    }

    static func line(_ state: RemoteState) -> String {
        switch state.phase {
        case .idle: String(localized: "On your iPhone, whenever you're ready.")
        case .connecting: String(localized: "Calling \(state.name)…")
        case .live: state.muted ? String(localized: "You're muted") : String(localized: "In a call")
        case .onHold: String(localized: "On hold")
        case .ended: String(localized: "Talk soon.")
        }
    }
}
