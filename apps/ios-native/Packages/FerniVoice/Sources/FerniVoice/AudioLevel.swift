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
    /// Armed: the next audible buffer runs `firstSound`, once.
    private let armed = Atomic<Bool>(false)
    private let firstSound = Mutex<(@Sendable () -> Void)?>(nil)

    public init() {}

    /// Runs `action` once, on the audio thread, at the first audible buffer
    /// after this (a level above the gate): when Ferni is first heard.
    public func onFirstSound(_ action: @escaping @Sendable () -> Void) {
        firstSound.withLock { $0 = action }
        armed.store(true, ordering: .releasing)
    }

    public var level: Float { Float(bitPattern: bits.load(ordering: .relaxed)) }

    public func feed(_ samples: UnsafeBufferPointer<Float>) {
        guard let base = samples.baseAddress, !samples.isEmpty else { return }
        var rms: Float = 0
        vDSP_rmsqv(base, 1, &rms, vDSP_Length(samples.count))
        let level = Self.gated(rms)
        bits.store(level.bitPattern, ordering: .relaxed)
        // One atomic load per buffer; the lock is taken once, on the first sound.
        if level > 0, armed.load(ordering: .acquiring), armed.exchange(false, ordering: .acquiringAndReleasing),
           let action = firstSound.withLock({ action in defer { action = nil }; return action }) {
            action()
        }
    }

    public func reset() { bits.store(0, ordering: .relaxed) }

    static func gated(_ rms: Float) -> Float { min(1, max(0, (rms - 0.02) * 4)) }
}
