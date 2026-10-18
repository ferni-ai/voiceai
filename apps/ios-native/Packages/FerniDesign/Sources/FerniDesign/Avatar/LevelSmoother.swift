import Foundation

/// Smooths the level per frame, independent of the frame rate: the web's
/// per-60 Hz-frame attack 0.25 / release 0.08, scaled to the frame's `dt`.
public struct LevelSmoother: Sendable {
    public private(set) var value: Float = 0

    public init() {}

    public mutating func step(toward target: Float, dt: Double) -> Float {
        let rate: Float = target > value ? 0.25 : 0.08
        let alpha = 1 - pow(1 - rate, Float(max(0, dt) * 60))
        value += (target - value) * alpha
        return value
    }
}
