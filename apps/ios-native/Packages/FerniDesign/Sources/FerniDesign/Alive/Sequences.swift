import Foundation

/// A choreographed moment from design-system/tokens/sequences.json: timed
/// steps on named elements. The body plays the steps the alive prototype's
/// playSequence plays (number tracks on the avatar, its glow, halo and eyes;
/// a face held over it; sparkles; a flush of light); the rest belong to
/// screens Ferni's body isn't (status text, cards, buttons).
public struct AliveSequence: Decodable, Equatable, Sendable {
    public struct Step: Decodable, Equatable, Sendable {
        var element: String
        /// Milliseconds, before the persona's tempo.
        var delay: Double?, duration: Double?
        var easing: String?
        /// The number tracks (`scale: [1, 1.03, 1]`), keyed by property.
        var tracks: [String: [Double]] = [:]
        var expression: String?
        var particles: Int?

        enum CodingKeys: String, CodingKey { case element, delay, duration, easing, properties }

        public init(from decoder: any Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            element = try c.decode(String.self, forKey: .element)
            delay = try c.decodeIfPresent(Double.self, forKey: .delay)
            duration = try c.decodeIfPresent(Double.self, forKey: .duration)
            easing = try c.decodeIfPresent(String.self, forKey: .easing)
            guard c.contains(.properties) else { return }
            let p = try c.nestedContainer(keyedBy: AnyKey.self, forKey: .properties)
            for key in p.allKeys {
                if let values = try? p.decode([Double].self, forKey: key), values.count > 1 { tracks[key.stringValue] = values }
                if key.stringValue == "expression" { expression = try? p.decode(String.self, forKey: key) }
                if key.stringValue == "particles" { particles = try? p.decode(Int.self, forKey: key) }
            }
        }
    }

    var totalDuration: Double?
    var steps: [Step]
}

struct AnyKey: CodingKey {
    var stringValue: String
    var intValue: Int? { nil }
    init(stringValue: String) { self.stringValue = stringValue }
    init?(intValue: Int) { nil }
}

/// The sequences, loaded once from the bundled token copy
/// (scripts/sync-expression-tokens.py), with Reduce Motion's removed steps
/// and the priorities that decide which moment wins.
enum SequenceTokens {
    struct File: Decodable {
        struct Simplification: Decodable, Equatable { var removeSteps: [String]? }
        struct Reduced: Decodable, Equatable { var simplifications: [String: Simplification]? }
        struct Priorities: Decodable, Equatable { var levels: [String: [String]] }
        struct Orchestration: Decodable, Equatable { var priorities: Priorities }

        var sequences: [String: AliveSequence]
        var reducedMotion: Reduced?
        var orchestration: Orchestration?

        enum CodingKeys: String, CodingKey { case sequences, reducedMotion, orchestration }

        init(from decoder: any Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            // The source's sequences also hold a "_documentation" string.
            let s = try c.nestedContainer(keyedBy: AnyKey.self, forKey: .sequences)
            var all: [String: AliveSequence] = [:]
            for key in s.allKeys {
                if let sequence = try? s.decode(AliveSequence.self, forKey: key) { all[key.stringValue] = sequence }
            }
            sequences = all
            reducedMotion = try c.decodeIfPresent(Reduced.self, forKey: .reducedMotion)
            orchestration = try c.decodeIfPresent(Orchestration.self, forKey: .orchestration)
        }
    }

    static let file: File? = {
        guard let url = Bundle.module.url(forResource: "sequence-tokens", withExtension: "json"),
              let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(File.self, from: data)
    }()

    static func sequence(_ id: String) -> AliveSequence? { file?.sequences[id] }

    static func removedUnderReduceMotion(_ id: String) -> Set<String> {
        Set(file?.reducedMotion?.simplifications?[id]?.removeSteps ?? [])
    }

    /// critical 3, high 2, normal 1, low 0 (orchestration.priorities).
    static func priority(_ id: String) -> Int {
        let levels = file?.orchestration?.priorities.levels ?? [:]
        for (rank, level) in ["low", "normal", "high", "critical"].enumerated().reversed()
        where levels[level]?.contains(id) == true { return rank }
        return 1
    }
}

/// A choreographed moment to play, numbered so the same one twice plays twice.
public struct MomentBeat: Equatable, Sendable {
    public let id: String
    public let count: Int

    public init(_ id: String, count: Int) {
        self.id = id
        self.count = count
    }
}

/// The prototype's layer: what the playing sequence adds to the body this frame.
struct SequenceLayer: Equatable {
    var ty = 0.0, rot = 0.0, scale = 1.0, sx = 1.0, sy = 1.0, glow = 0.0, halo = 0.0, haloS = 1.0, eyesTy = 0.0
    /// Degrees, negative down. No token drives it; accents do (SequenceAccent).
    var pitch = 0.0

    /// Which body channel each element's property drives (the prototype's CHANNEL).
    /// Immutable; key paths just aren't marked Sendable.
    nonisolated(unsafe) static let channels: [String: [String: WritableKeyPath<SequenceLayer, Double>]] = [
        "avatar": ["translateY": \.ty, "rotate": \.rot, "scale": \.scale, "scaleX": \.sx, "scaleY": \.sy],
        "newAvatar": ["scale": \.scale],
        "avatarGlow": ["opacity": \.glow], "transitionGlow": ["opacity": \.glow],
        "halo": ["opacity": \.halo, "scale": \.haloS], "connectionRing": ["opacity": \.halo, "scale": \.haloS],
        "eyes": ["translateY": \.eyesTy],
    ]

    /// Scales multiply (relative to the track's first value); light adds its change; the rest add.
    static func multiplies(_ k: WritableKeyPath<SequenceLayer, Double>) -> Bool {
        k == \.scale || k == \.sx || k == \.sy || k == \.haloS
    }
    static func lights(_ k: WritableKeyPath<SequenceLayer, Double>) -> Bool { k == \.glow || k == \.halo }
}

/// What iOS adds to a sequence whose tokens read as nothing on a phone. The
/// tokens stay the design system's; the accent plays over them.
struct SequenceAccent: Equatable {
    /// A face held from the start, for `hold` seconds (before the tempo).
    var face: String, hold: Double
    /// A nod: pitch keys in degrees (negative down) over `nodSeconds`.
    var nod: [Double], nodSeconds: Double

    static let all: [String: SequenceAccent] = [
        // Expression audit P1 #13: celebration_small is a 4 px hop and a 2°
        // turn, invisible at phone size over the listening face. A small win
        // is a happy beat and an approving nod: down, up, a smaller down.
        "celebration_small": SequenceAccent(face: "happy", hold: 0.9, nod: [0, -9, 1.5, -5, 0], nodSeconds: 0.75),
    ]
}

/// The prototype's EASE table; anything else eases gently.
func sequenceEase(_ name: String?) -> (Double) -> Double {
    switch name {
    case "spring": { u in let c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * pow(u - 1, 3) + c1 * pow(u - 1, 2) }
    case "decelerate": { u in 1 - pow(1 - u, 3) }
    case "accelerate": { u in u * u * u }
    case "expoOut": { u in u >= 1 ? 1 : 1 - pow(2, -10 * u) }
    case "linear": { u in u }
    default: { u in u < 0.5 ? 2 * u * u : 1 - pow(-2 * u + 2, 2) / 2 }
    }
}
