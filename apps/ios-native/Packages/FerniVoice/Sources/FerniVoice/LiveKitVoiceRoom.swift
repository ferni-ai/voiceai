import Accelerate
import AVFAudio
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
    private let agentLevel: AgentLevelRenderer

    /// Same topic the web and agents-js use for live transcripts.
    static let transcriptionTopic = "lk.transcription"

    /// - Parameter agentLevel: fed with Ferni's voice while it plays.
    public init(agentLevel: AudioLevelMeter) {
        self.agentLevel = AgentLevelRenderer(meter: agentLevel)
        (events, continuation) = AsyncStream.makeStream(of: RoomEvent.self)
        super.init()
        room.add(delegate: self)
    }

    public func connect(url: String, token: String) async throws {
        try await room.registerTextStreamHandler(for: Self.transcriptionTopic) { [weak self] reader, sender in
            guard let self else { return }
            let attributes = reader.info.attributes
            let local = self.room.localParticipant
            guard let speaker = Self.captionSpeaker(
                sender: sender.stringValue,
                transcribedTrack: attributes["lk.transcribed_track_id"],
                local: local.identity?.stringValue,
                localTracks: Set(local.trackPublications.keys.map(\.stringValue)),
                agents: Set(self.room.remoteParticipants.values.filter(\.isAgent).compactMap(\.identity?.stringValue))
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

    public func send(_ data: Data) async throws {
        try await room.localParticipant.publish(data: data, options: DataPublishOptions(reliable: true))
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

    /// Ferni's voice track ("roomio_audio"; "background_*" is music) feeds the level meter.
    public func room(_ room: Room, participant: RemoteParticipant, didSubscribeTrack publication: RemoteTrackPublication) {
        guard participant.isAgent, !publication.name.hasPrefix("background"),
              let track = publication.track as? RemoteAudioTrack else { return }
        track.add(audioRenderer: agentLevel)
    }

    public func room(_ room: Room, participant: RemoteParticipant, didUnsubscribeTrack publication: RemoteTrackPublication) {
        (publication.track as? RemoteAudioTrack)?.remove(audioRenderer: agentLevel)
        agentLevel.meter.reset()
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

    /// Whose caption a transcript stream is, or nil to ignore it.
    ///
    /// LiveKit hands the handler the identity in the stream's packet, which the
    /// sender sets (agents-js sends our words with `senderIdentity` = us), not a
    /// server-verified one: the SDK doesn't expose who actually delivered it.
    /// The trust boundary is the room. /token signs a room-scoped grant for the
    /// verified uid, only for a room that uid owns, so the only members are us
    /// and the server's agent. Within that, a stream is accepted only from an
    /// agent or from our own identity, and it's ours only if it transcribes one
    /// of our own published tracks.
    static func captionSpeaker(
        sender: String, transcribedTrack: String?, local: String?, localTracks: Set<String>, agents: Set<String>
    ) -> CaptionChunk.Speaker? {
        guard agents.contains(sender) || sender == local else { return nil }
        if let transcribedTrack { return localTracks.contains(transcribedTrack) ? .you : .ferni }
        return sender == local ? .you : .ferni
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

/// LiveKit hands this each decoded buffer of Ferni's audio on its audio thread.
final class AgentLevelRenderer: NSObject, AudioRenderer, Sendable {
    let meter: AudioLevelMeter

    init(meter: AudioLevelMeter) { self.meter = meter }

    func render(pcmBuffer: AVAudioPCMBuffer) {
        let frames = Int(pcmBuffer.frameLength)
        if let floats = pcmBuffer.floatChannelData {
            meter.feed(UnsafeBufferPointer(start: floats[0], count: frames))
        } else if let ints = pcmBuffer.int16ChannelData, frames > 0 {
            // Rare int16 buffers: convert into a stack-sized scratch, capped.
            let count = min(frames, 4096)
            withUnsafeTemporaryAllocation(of: Float.self, capacity: count) { scratch in
                vDSP_vflt16(ints[0], 1, scratch.baseAddress!, 1, vDSP_Length(count))
                var scale = Float(1) / 32768
                vDSP_vsmul(scratch.baseAddress!, 1, &scale, scratch.baseAddress!, 1, vDSP_Length(count))
                meter.feed(UnsafeBufferPointer(scratch))
            }
        }
    }
}
