import Foundation

/// Turns a number from a data message into a duration that can't crash the
/// app: `Duration.milliseconds(Int(x))` traps on NaN, ±∞ or anything past
/// Int.max, and a packet is untrusted input.
enum RemoteDuration {
    static let maximum: Double = 60 // seconds

    /// Seconds, clamped to 0...60 s; nil when missing or NaN.
    static func seconds(_ value: Double?) -> Duration? {
        guard let value, !value.isNaN else { return nil }
        let clamped = min(max(value, 0), maximum) // ±∞ land on the bounds
        return .milliseconds(Int((clamped * 1000).rounded()))
    }
}
