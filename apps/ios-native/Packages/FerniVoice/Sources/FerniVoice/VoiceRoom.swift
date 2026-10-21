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
    /// A reliable data message to the agent (e.g. user_interrupt).
    func send(_ data: Data) async throws
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
    /// When it was first heard (a report finds the reply by time).
    public var at: Date = .now
    /// The room it was heard in. A rejoin gets a new room, so a report about
    /// an earlier line uses this, not the call's room at send time (critic L2).
    public var room: String?
    /// Who on the team said it (Ferni's side only): after a handoff, the
    /// captions say whose words they are (design audit P1-3).
    public var personaID: String?
    /// Not words: a teammate came in ("Maya joined", award upgrade 4). Its
    /// personaID is who; it's never copied or reported.
    public var joined = false

    public init(
        id: String, speaker: CaptionChunk.Speaker, text: String, isFinal: Bool, at: Date = .now, room: String? = nil,
        personaID: String? = nil, joined: Bool = false
    ) {
        self.id = id
        self.speaker = speaker
        self.text = text
        self.isFinal = isFinal
        self.at = at
        self.room = room
        self.personaID = personaID
        self.joined = joined
    }
}

/// Assembles caption chunks the way the web does: chunks of the same stream
/// append, a new stream for the same segment replaces the text (the agent
/// re-sends a corrected segment), and only the last few lines are kept.
public struct CaptionBook: Sendable, Equatable {
    public private(set) var lines: [Caption] = []
    private var streamForSegment: [String: String] = [:]
    private var joins = 0
    private let keep: Int

    public init(keep: Int = 6) { self.keep = keep }

    public mutating func apply(_ chunk: CaptionChunk, room: String? = nil, persona: String? = nil) {
        guard !chunk.text.isEmpty || chunk.isFinal else { return }
        let id = "\(chunk.speaker)-\(chunk.segmentID)"
        if let index = lines.firstIndex(where: { $0.id == id }) {
            let sameStream = streamForSegment[id] == chunk.streamID
            lines[index].text = sameStream ? lines[index].text + chunk.text : chunk.text
            lines[index].isFinal = chunk.isFinal
        } else if !chunk.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            // A bare end-of-segment marker with nothing said isn't a line.
            lines.append(Caption(id: id, speaker: chunk.speaker, text: chunk.text, isFinal: chunk.isFinal, room: room,
                                 personaID: chunk.speaker == .ferni ? persona : nil))
            if lines.count > keep { lines.removeFirst(lines.count - keep) }
        }
        streamForSegment[id] = chunk.streamID
        if chunk.isFinal { streamForSegment[id] = nil }
    }

    /// A teammate came in: a "joined" line between the words before and after.
    /// Two joins with nothing said between them are one line, the latest
    /// (critic M-F: Maya, then Ferni straight back, left two lines).
    public mutating func join(_ personaID: String, room: String? = nil) {
        joins += 1
        let line = Caption(id: "joined-\(joins)", speaker: .ferni, text: "", isFinal: true, room: room,
                           personaID: personaID, joined: true)
        if let last = lines.indices.last, lines[last].joined {
            lines[last] = line
            return
        }
        lines.append(line)
        if lines.count > keep { lines.removeFirst(lines.count - keep) }
    }

    public mutating func clear() {
        lines = []
        streamForSegment = [:]
    }
}
