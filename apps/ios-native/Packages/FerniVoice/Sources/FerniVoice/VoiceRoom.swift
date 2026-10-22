import Foundation

/// What a call room tells the session, already reduced to plain values.
public enum RoomEvent: Sendable, Equatable {
    /// The agent participant is in the room (or was already when we joined).
    case agentJoined(attributes: [String: String])
    case agentLeft
    /// The agent's attributes changed; `lk.agent.state` lives here.
    case agentAttributes([String: String])
    /// A data message (JSON) from the agent: speech_state, expression_update...
    case data(Data)
    /// A piece of an `lk.transcription` text stream.
    case caption(CaptionChunk)
    case reconnecting
    case reconnected
    /// The room closed. `byUs` is false when the network or server ended it.
    case disconnected(byUs: Bool)
}

/// The call's connection to LiveKit, behind a protocol so the session can be
/// tested with a fake room. One instance per attempt: a retry gets a new room.
public protocol VoiceRoom: AnyObject, Sendable {
    /// Every event for this room, in order. Finishes when the room is done.
    var events: AsyncStream<RoomEvent> { get }
    func connect(url: String, token: String) async throws
    func setMicrophone(enabled: Bool) async throws
    func disconnect() async
}

/// One chunk of a live caption stream.
public struct CaptionChunk: Sendable, Equatable {
    public enum Speaker: Sendable, Equatable { case ferni, you }

    public let streamID: String
    public let segmentID: String
    public let speaker: Speaker
    public let text: String
    public let isFinal: Bool

    public init(streamID: String, segmentID: String, speaker: Speaker, text: String, isFinal: Bool) {
        self.streamID = streamID
        self.segmentID = segmentID
        self.speaker = speaker
        self.text = text
        self.isFinal = isFinal
    }
}

/// A line of captions as the screen shows it.
public struct Caption: Identifiable, Sendable, Equatable {
    public let id: String
    public let speaker: CaptionChunk.Speaker
    public var text: String
    public var isFinal: Bool
}

/// Assembles caption chunks the way the web does: chunks of the same stream
/// append, a new stream for the same segment replaces the text (the agent
/// re-sends a corrected segment), and only the last few lines are kept.
public struct CaptionBook: Sendable, Equatable {
    public private(set) var lines: [Caption] = []
    private var streamForSegment: [String: String] = [:]
    private let keep: Int

    public init(keep: Int = 6) { self.keep = keep }

    public mutating func apply(_ chunk: CaptionChunk) {
        guard !chunk.text.isEmpty || chunk.isFinal else { return }
        let id = "\(chunk.speaker)-\(chunk.segmentID)"
        if let index = lines.firstIndex(where: { $0.id == id }) {
            let sameStream = streamForSegment[id] == chunk.streamID
            lines[index].text = sameStream ? lines[index].text + chunk.text : chunk.text
            lines[index].isFinal = chunk.isFinal
        } else if !chunk.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            // A bare end-of-segment marker with nothing said isn't a line.
            lines.append(Caption(id: id, speaker: chunk.speaker, text: chunk.text, isFinal: chunk.isFinal))
            if lines.count > keep { lines.removeFirst(lines.count - keep) }
        }
        streamForSegment[id] = chunk.streamID
        if chunk.isFinal { streamForSegment[id] = nil }
    }

    public mutating func clear() {
        lines = []
        streamForSegment = [:]
    }
}
