import Foundation
import LiveKit
import Synchronization

/// The real call room: LiveKit 2.12. LiveKit calls its delegate on its own
/// queues; every callback becomes a `RoomEvent` on one ordered stream, so the
/// session (on the main actor) never touches LiveKit objects.
public final class LiveKitVoiceRoom: NSObject, VoiceRoom, RoomDelegate, @unchecked Sendable {
    public let events: AsyncStream<RoomEvent>
    private let continuation: AsyncStream<RoomEvent>.Continuation
    private let room = Room()
    private let leaving = Mutex(false)

    /// Same topic the web and agents-js use for live transcripts.
    static let transcriptionTopic = "lk.transcription"

    override public init() {
        (events, continuation) = AsyncStream.makeStream(of: RoomEvent.self)
        super.init()
        room.add(delegate: self)
    }

    public func connect(url: String, token: String) async throws {
        try await room.registerTextStreamHandler(for: Self.transcriptionTopic) { [weak self] reader, sender in
            guard let self else { return }
            let attributes = reader.info.attributes
            let agents = Set(self.room.remoteParticipants.values.filter(\.isAgent).compactMap(\.identity?.stringValue))
            guard let speaker = Self.captionSpeaker(
                sender: sender.stringValue, local: self.room.localParticipant.identity?.stringValue, agents: agents
            ) else { return } // only Ferni's words, or ours as Ferni heard them
            let segmentID = attributes["lk.segment_id"] ?? reader.info.id
            let isFinal = attributes["lk.transcription_final"] == "true"
            for try await text in reader {
                self.continuation.yield(.caption(CaptionChunk(
                    streamID: reader.info.id, segmentID: segmentID, speaker: speaker, text: text, isFinal: false
                )))
            }
            if isFinal {
                self.continuation.yield(.caption(CaptionChunk(
                    streamID: reader.info.id, segmentID: segmentID, speaker: speaker, text: "", isFinal: true
                )))
            }
        }
        try await room.connect(url: url, token: token)
        // An agent that was dispatched before we arrived is already here.
        for participant in room.remoteParticipants.values where participant.isAgent {
            continuation.yield(.agentJoined(attributes: participant.attributes))
        }
    }

    public func setMicrophone(enabled: Bool) async throws {
        try await room.localParticipant.setMicrophone(enabled: enabled)
    }

    public func disconnect() async {
        leaving.withLock { $0 = true }
        await room.unregisterTextStreamHandler(for: Self.transcriptionTopic)
        await room.disconnect()
        continuation.finish()
    }

    // MARK: - RoomDelegate (LiveKit's queues)

    public func room(_ room: Room, participantDidConnect participant: RemoteParticipant) {
        if participant.isAgent { continuation.yield(.agentJoined(attributes: participant.attributes)) }
    }

    public func room(_ room: Room, participantDidDisconnect participant: RemoteParticipant) {
        if participant.isAgent { continuation.yield(.agentLeft) }
    }

    public func room(_ room: Room, participant: Participant, didUpdateAttributes attributes: [String: String]) {
        // The diff can omit unchanged keys; send the participant's full set.
        if participant.isAgent { continuation.yield(.agentAttributes(participant.attributes)) }
    }

    public func room(
        _ room: Room, participant: RemoteParticipant?, didReceiveData data: Data,
        forTopic topic: String, encryptionType: EncryptionType
    ) {
        guard Self.trustsData(fromAgent: participant?.isAgent) else { return }
        continuation.yield(.data(data))
    }

    /// Data messages steer the call (speech state, expressions): only the agent may send them.
    static func trustsData(fromAgent isAgent: Bool?) -> Bool { isAgent == true }

    /// Whose caption a transcript stream is: ours (the agent sends our words under our
    /// identity), Ferni's (an agent participant), or nobody's (anyone else: ignored).
    static func captionSpeaker(sender: String, local: String?, agents: Set<String>) -> CaptionChunk.Speaker? {
        if sender == local { return .you }
        return agents.contains(sender) ? .ferni : nil
    }

    public func room(_ room: Room, didStartReconnectWithMode reconnectMode: ReconnectMode) {
        continuation.yield(.reconnecting)
    }

    public func room(_ room: Room, didCompleteReconnectWithMode reconnectMode: ReconnectMode) {
        continuation.yield(.reconnected)
    }

    public func room(_ room: Room, didDisconnectWithError error: LiveKitError?) {
        continuation.yield(.disconnected(byUs: leaving.withLock { $0 }))
        continuation.finish()
    }
}
