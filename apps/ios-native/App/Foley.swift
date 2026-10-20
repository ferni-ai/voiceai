import AudioToolbox
import Foundation

/// Ferni's two quiet sounds at rest, synthesised the way the alive
/// prototype's Sound.tone makes them: a soft "boop" when he's touched, and a
/// small rising "huh?" when he notices you (a finger held near him, the
/// double take's start). Played as system sounds, so the silent switch mutes
/// them and a call's audio session is never touched.
enum Foley: String, CaseIterable, Sendable {
    case poke, huh

    static let sampleRate = 44_100.0

    /// A sine sweeping from `f0` to `f1` over 80% of `duration`, rising to
    /// `gain` in 12 ms and dying away by `duration` (both exponential).
    struct Tone: Equatable { var f0, f1, duration, gain, delay: Double }

    var tones: [Tone] {
        switch self {
        case .poke:
            // The prototype's poke(h) at mid-height (h 0.3).
            let f = 200 + 0.3 * 90
            return [Tone(f0: f * 1.3, f1: f * 0.8, duration: 0.32, gain: 0.13, delay: 0),
                    Tone(f0: f * 2.1, f1: f * 1.4, duration: 0.18, gain: 0.03, delay: 0.02)]
        case .huh:
            return [Tone(f0: 420, f1: 640, duration: 0.18, gain: 0.06, delay: 0)]
        }
    }

    /// The waveform (-1...1), through the prototype's 0.9 master gain.
    var samples: [Float] {
        let length = tones.map { $0.delay + $0.duration }.max() ?? 0
        var out = [Float](repeating: 0, count: Int((length * Self.sampleRate).rounded(.up)))
        for tone in tones {
            var phase = 0.0
            let start = Int(tone.delay * Self.sampleRate), sweep = tone.duration * 0.8, attack = 0.012
            for n in start..<min(out.count, start + Int(tone.duration * Self.sampleRate)) {
                let t = Double(n - start) / Self.sampleRate
                let f = t < sweep ? tone.f0 * pow(tone.f1 / tone.f0, t / sweep) : tone.f1
                phase += 2 * .pi * f / Self.sampleRate
                let g = t < attack ? 0.0001 * pow(tone.gain / 0.0001, t / attack)
                    : tone.gain * pow(0.0001 / tone.gain, (t - attack) / (tone.duration - attack))
                out[n] += Float(sin(phase) * g * 0.9)
            }
        }
        return out
    }

    /// 16-bit mono PCM WAV.
    var wav: Data {
        let pcm = samples.map { Int16(max(-1, min(1, $0)) * Float(Int16.max)) }
        var d = Data()
        func le<T: FixedWidthInteger>(_ v: T) { withUnsafeBytes(of: v.littleEndian) { d.append(contentsOf: $0) } }
        let bytes = UInt32(pcm.count * 2)
        d.append(contentsOf: Array("RIFF".utf8)); le(36 + bytes); d.append(contentsOf: Array("WAVE".utf8))
        d.append(contentsOf: Array("fmt ".utf8)); le(UInt32(16)); le(UInt16(1)); le(UInt16(1))
        le(UInt32(Self.sampleRate)); le(UInt32(Self.sampleRate) * 2); le(UInt16(2)); le(UInt16(16))
        d.append(contentsOf: Array("data".utf8)); le(bytes)
        pcm.forEach { le($0) }
        return d
    }
}

/// Plays foley as system sounds, each written once to Caches.
@MainActor
final class FoleyPlayer {
    private var ids: [Foley: SystemSoundID] = [:]

    func play(_ foley: Foley) {
        guard let id = id(for: foley) else { return }
        AudioServicesPlaySystemSound(id)
        #if DEBUG
        UITestScenario.Counters.shared.foley += 1
        #endif
    }

    private func id(for foley: Foley) -> SystemSoundID? {
        if let id = ids[foley] { return id }
        guard let dir = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first else { return nil }
        let url = dir.appending(path: "foley-\(foley.rawValue).wav")
        guard (try? foley.wav.write(to: url, options: .atomic)) != nil else { return nil }
        var id: SystemSoundID = 0
        guard AudioServicesCreateSystemSoundID(url as CFURL, &id) == kAudioServicesNoError else { return nil }
        ids[foley] = id
        return id
    }
}
