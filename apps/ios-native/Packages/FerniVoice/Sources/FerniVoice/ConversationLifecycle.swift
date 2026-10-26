import AVFAudio
import Foundation
import LiveCommunicationKit
import os

/// The call on LiveCommunicationKit: outgoing only, kept out of Recents, no
/// video, no PushKit. The system shows it on the Lock Screen and in its call
/// UI, routes AirPods mute to it, and keeps the audio going when locked.
public final class ConversationLifecycle: NSObject, CallLifecycle, ConversationManagerDelegate, @unchecked Sendable {
    public let requests: AsyncStream<LifecycleRequest>
    private let continuation: AsyncStream<LifecycleRequest>.Continuation
    private let manager: ConversationManager
    private let log = Logger(subsystem: "com.sethdford.ferni", category: "call")

    /// The Simulator has no call service: it ends every conversation at once
    /// (seen 2026-10-18, iOS 26.2 runtime), so simulator builds run without it.
    public static var isAvailable: Bool {
        #if targetEnvironment(simulator)
        false
        #else
        true
        #endif
    }

    override public init() {
        (requests, continuation) = AsyncStream.makeStream(of: LifecycleRequest.self)
        manager = ConversationManager(configuration: .init(
            ringtoneName: nil, iconTemplateImageData: nil,
            maximumConversationGroups: 1, maximumConversationsPerConversationGroup: 1,
            includesConversationInRecents: false, supportsVideo: false,
            supportedHandleTypes: [.generic]
        ))
        super.init()
        manager.delegate = self
    }

    public func begin(id: UUID, name: String) async throws {
        let handle = Handle(type: .generic, value: "ferni", displayName: name)
        try await manager.perform([StartConversationAction(conversationUUID: id, handles: [handle], isVideo: false)])
    }

    public func connected(id: UUID) {
        guard let conversation = conversation(id) else { return }
        manager.reportConversationEvent(.conversationConnected(.now), for: conversation)
    }

    public func setMuted(id: UUID, muted: Bool) async {
        try? await manager.perform([MuteConversationAction(conversationUUID: id, isMuted: muted)])
    }

    public func ended(id: UUID, failed: Bool) async {
        guard let conversation = conversation(id) else { return }
        if failed {
            manager.reportConversationEvent(.conversationEnded(.now, .failed), for: conversation)
        } else {
            try? await manager.perform([EndConversationAction(conversationUUID: id)])
        }
    }

    private func conversation(_ id: UUID) -> Conversation? {
        manager.conversations.first { $0.uuid == id }
    }

    // MARK: - ConversationManagerDelegate

    public func conversationManager(_ manager: ConversationManager, perform action: ConversationAction) {
        switch action {
        case let start as StartConversationAction:
            start.fulfill(dateStarted: .now)
            if let conversation = conversation(start.conversationUUID) {
                manager.reportConversationEvent(.conversationStartedConnecting(.now), for: conversation)
            }
        case let end as EndConversationAction:
            continuation.yield(.end)
            end.fulfill(dateEnded: .now)
        case let mute as MuteConversationAction:
            continuation.yield(.mute(mute.isMuted))
            mute.fulfill()
        default:
            action.fail()
        }
    }

    public func conversationManager(_ manager: ConversationManager, conversationChanged conversation: Conversation) {}
    public func conversationManagerDidBegin(_ manager: ConversationManager) {}
    public func conversationManagerDidReset(_ manager: ConversationManager) {
        continuation.yield(.end)
    }
    public func conversationManager(_ manager: ConversationManager, timedOutPerforming action: ConversationAction) {
        log.error("Conversation action timed out: \(String(describing: type(of: action)), privacy: .public)")
    }
    public func conversationManager(_ manager: ConversationManager, didActivate audioSession: AVAudioSession) {
        continuation.yield(.audio(active: true))
    }
    public func conversationManager(_ manager: ConversationManager, didDeactivate audioSession: AVAudioSession) {
        continuation.yield(.audio(active: false))
    }
}
