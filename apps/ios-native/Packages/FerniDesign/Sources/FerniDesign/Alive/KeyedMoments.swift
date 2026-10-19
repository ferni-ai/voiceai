import Foundation

/// A damped spring toward a target: everything about Ferni's body moves on
/// these, so new targets blend in with weight and overshoot.
public struct RigSpring: Equatable, Sendable {
    public var x: Double, v = 0.0, t: Double
    let k: Double, d: Double

    public init(_ x: Double, k: Double, d: Double) {
        self.x = x
        self.t = x
        self.k = k
        self.d = d
    }

    /// Semi-implicit Euler; the rig sub-steps at 240 Hz so stiff springs stay stable.
    public mutating func step(_ dt: Double) {
        let a = -k * (x - t) - d * v
        v += a * dt
        x += v * dt
    }
}

/// How a key eases in from the key before it.
public enum KeyEase: Sendable {
    case out, `in`, inOut, snap, overshoot, linear, hold

    public func callAsFunction(_ u: Double) -> Double {
        switch self {
        case .out: 1 - pow(1 - u, 3)
        case .in: u * u * u
        case .inOut: u < 0.5 ? 4 * u * u * u : 1 - pow(-2 * u + 2, 3) / 2
        case .snap: u >= 1 ? 1 : 1 - pow(2, -12 * u)
        case .overshoot: 1 + 2.9 * pow(u - 1, 3) + 1.9 * pow(u - 1, 2)
        case .linear: u
        case .hold: u >= 1 ? 1 : 0
        }
    }
}

/// The poses a keyed moment drives. Paired channels drive both eyes.
public enum KeyChannel: Sendable, CaseIterable {
    case posY, posX, squash, top, arch, eyeSY, eyeSX, gazeY, gazeX, pitch, roll, yaw, glow, halo, blush
}

/// What a keyed moment asks the app for at a given frame (sound, sparkle).
public enum KeyedCue: Equatable, Sendable {
    case arrivalChime, pop, sparkle, land, hop, whoosh, giggle, heart
    /// A finger on Ferni: one soft tap in the hand, at most every 2 s.
    case touch
}

/// Hand-keyed moments: poses on exact frames at 60 fps, each key with its own
/// ease. Secondary motion (shear, ring, jelly) stays on springs, so the keys
/// drive the pose and physics adds the overlap. From the alive prototype's KEYED.
public enum KeyedMoment: String, CaseIterable, Sendable {
    case arrival, win, goodbye

    public struct Key: Sendable {
        public let frame: Double, value: Double, ease: KeyEase
    }

    public var end: Double {
        switch self {
        case .arrival: 128
        case .win: 110
        case .goodbye: 168
        }
    }

    /// The value of `keys` at `frame` (before the first key: the first value;
    /// after the last: the last).
    public static func sample(_ keys: [Key], at frame: Double) -> Double {
        guard let first = keys.first else { return 0 }
        if frame <= first.frame { return first.value }
        for i in 1..<keys.count where frame < keys[i].frame {
            let a = keys[i - 1], b = keys[i]
            return a.value + (b.value - a.value) * b.ease((frame - a.frame) / (b.frame - a.frame))
        }
        return keys[keys.count - 1].value
    }

    public var channels: [KeyChannel: [Key]] {
        switch self {
        case .arrival: Self.arrivalKeys
        case .win: Self.winKeys
        case .goodbye: Self.goodbyeKeys
        }
    }

    public var cues: [(frame: Double, cue: KeyedCue)] {
        switch self {
        case .arrival: [(28, .arrivalChime), (65, .pop), (84, .sparkle), (94, .land)]
        case .win: [(18, .hop), (22, .whoosh), (34, .sparkle), (46, .land), (50, .giggle), (62, .hop), (74, .land)]
        case .goodbye: [(16, .heart)]
        }
    }

    // [frame, value, ease]; the first key's ease is never used.
    private static func k(_ rows: [(Double, Double, KeyEase)]) -> [Key] {
        rows.map { Key(frame: $0.0, value: $0.1, ease: $0.2) }
    }

    private static let arrivalKeys: [KeyChannel: [Key]] = [
        .posY: k([(0, -2.5, .linear), (22, 0.18, .out), (30, 0.2, .linear), (38, -0.05, .inOut), (46, 0.02, .out),
                  (56, 0, .inOut), (80, 0, .linear), (86, 0.12, .out), (94, -0.02, .in), (100, 0, .out)]),
        .squash: k([(0, 0.8, .linear), (10, 1.18, .out), (22, 1.08, .inOut), (30, 1.05, .linear), (38, 0.86, .in),
                    (46, 1.04, .out), (56, 1, .inOut), (64, 1, .linear), (66, 0.95, .snap), (70, 1.06, .overshoot),
                    (78, 1, .inOut), (80, 0.9, .in), (84, 1.1, .out), (92, 1.04, .linear), (95, 0.9, .in),
                    (100, 1.02, .out), (110, 1, .inOut)]),
        .top: k([(0, 1, .linear), (44, 1, .hold), (54, 0.55, .inOut), (60, 0.6, .linear), (62, 1, .snap),
                 (65, 0, .snap), (96, 0.06, .inOut)]),
        .arch: k([(0, 0, .linear), (80, 0, .hold), (86, 0.6, .out), (104, 0.6, .linear), (120, 0, .inOut)]),
        .eyeSY: k([(0, 1, .linear), (62, 1, .hold), (65, 1.18, .snap), (76, 1, .inOut)]),
        .eyeSX: k([(0, 1, .linear), (62, 1, .hold), (65, 1.08, .snap), (76, 1, .inOut)]),
        .gazeY: k([(0, -0.35, .linear), (66, -0.35, .hold), (70, 0.08, .snap), (124, 0.04, .inOut)]),
        .gazeX: k([(0, 0, .linear), (66, 0, .hold), (70, 0.05, .snap), (124, 0, .inOut)]),
        .pitch: k([(0, 0.12, .linear), (38, 0, .inOut), (70, 0, .linear), (76, 0.07, .out), (90, 0, .inOut)]),
        .roll: k([(0, 0, .linear), (80, 0, .linear), (88, 0.12, .out), (104, 0.12, .linear), (120, 0, .inOut)]),
        .glow: k([(0, 0, .linear), (30, 0.5, .out), (46, 0.35, .inOut), (86, 0.7, .out), (124, 0.35, .inOut)]),
        .halo: k([(0, 0, .linear), (32, 0.55, .out), (60, 0.3, .inOut), (88, 0.6, .out), (124, 0.3, .inOut)]),
        .blush: k([(0, 0, .linear), (84, 0, .hold), (90, 0.6, .out), (124, 0, .inOut)]),
    ]

    private static let winKeys: [KeyChannel: [Key]] = [
        .squash: k([(0, 1, .linear), (8, 0.8, .out), (14, 0.8, .linear), (18, 1.28, .snap), (30, 1.08, .inOut),
                    (40, 1, .linear), (46, 0.76, .in), (50, 1.12, .out), (56, 0.96, .inOut), (62, 0.88, .in),
                    (66, 1.08, .out), (76, 1, .inOut)]),
        .posY: k([(0, 0, .linear), (8, -0.12, .out), (14, -0.12, .linear), (30, 1.0, .out), (34, 1.02, .linear),
                  (46, -0.06, .in), (50, 0.02, .out), (56, 0, .inOut), (62, -0.04, .in), (68, 0.2, .out),
                  (74, 0, .in), (84, 0, .inOut)]),
        .posX: k([(0, 0, .linear), (14, 0, .linear), (34, 0.5, .inOut), (46, 0.6, .out), (90, 0, .inOut)]),
        .yaw: k([(0, 0, .linear), (16, 0, .linear), (44, 2 * .pi, .inOut), (45, 0, .hold)]),
        .top: k([(0, 0.1, .linear), (6, 0.5, .out), (14, 0.6, .linear), (18, 0, .snap), (34, 0, .linear),
                 (38, 0.05, .inOut)]),
        .arch: k([(0, 0, .linear), (30, 0, .hold), (36, 0.7, .out), (84, 0.7, .linear), (104, 0, .inOut)]),
        .eyeSY: k([(0, 1, .linear), (16, 1, .hold), (18, 1.25, .snap), (30, 1, .inOut)]),
        .eyeSX: k([(0, 1, .linear), (16, 1, .hold), (18, 1.1, .snap), (30, 1, .inOut)]),
        .gazeY: k([(0, 0, .linear), (6, -0.2, .out), (16, -0.2, .linear), (20, 0.4, .snap), (34, 0.5, .linear),
                   (48, 0, .inOut)]),
        .roll: k([(0, 0, .linear), (46, 0, .linear), (52, 0.14, .out), (58, -0.12, .inOut), (64, 0.08, .inOut),
                  (72, 0, .inOut)]),
        .glow: k([(0, 0.3, .linear), (18, 0.6, .out), (34, 1.0, .out), (60, 0.8, .inOut), (104, 0.35, .inOut)]),
        .halo: k([(0, 0.3, .linear), (34, 1.0, .out), (104, 0.3, .inOut)]),
        .blush: k([(0, 0, .linear), (34, 0, .hold), (42, 0.7, .out), (104, 0, .inOut)]),
    ]

    private static let goodbyeKeys: [KeyChannel: [Key]] = [
        .pitch: k([(0, 0, .linear), (14, -0.12, .inOut), (40, -0.12, .linear), (46, -0.2, .inOut), (52, -0.08, .inOut),
                   (58, -0.18, .inOut), (66, -0.02, .inOut)]),
        .gazeY: k([(0, 0, .linear), (14, 0.05, .inOut)]),
        .arch: k([(0, 0, .linear), (16, 0.55, .out), (70, 0.55, .linear), (86, 0, .inOut)]),
        .blush: k([(0, 0, .linear), (16, 0.5, .out), (86, 0.2, .inOut)]),
        .roll: k([(0, 0, .linear), (64, 0, .linear), (72, 0.13, .inOut), (82, -0.13, .inOut), (92, 0.1, .inOut),
                  (102, 0, .inOut)]),
        .posY: k([(0, 0, .linear), (100, 0, .linear), (132, -0.18, .inOut), (168, -0.2, .linear)]),
        .squash: k([(0, 1, .linear), (100, 1, .linear), (132, 0.94, .inOut)]),
        .top: k([(0, 0.05, .linear), (86, 0.05, .linear), (98, 0.4, .inOut), (122, 0.6, .inOut), (144, 1, .inOut)]),
        .glow: k([(0, 0.5, .linear), (60, 0.6, .inOut), (168, 0.1, .inOut)]),
        .halo: k([(0, 0.4, .linear), (168, 0.05, .inOut)]),
    ]
}
