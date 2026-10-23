import Accelerate
import Foundation
import Synchronization

/// How loud Ferni is right now, 0...1, for the mouth, body and halo.
///
/// Fed on the audio thread (`feed`), read on the render thread (`level`):
/// one atomic, no locks, no allocation, no actor hop. The level is the web's
/// gated RMS (apps/web audio-rms.ts): `min(1, max(0, (rms - 0.02) * 4))`.
public final class AudioLevelMeter: Sendable {
    private let bits = Atomic<UInt32>(0)

    public init() {}

    public var level: Float { Float(bitPattern: bits.load(ordering: .relaxed)) }

    public func feed(_ samples: UnsafeBufferPointer<Float>) {
        guard let base = samples.baseAddress, !samples.isEmpty else { return }
        var rms: Float = 0
        vDSP_rmsqv(base, 1, &rms, vDSP_Length(samples.count))
        bits.store(Self.gated(rms).bitPattern, ordering: .relaxed)
    }

    public func reset() { bits.store(0, ordering: .relaxed) }

    static func gated(_ rms: Float) -> Float { min(1, max(0, (rms - 0.02) * 4)) }
}
