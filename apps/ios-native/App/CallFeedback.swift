import AVFAudio
import FerniDesign
import FerniVoice
import SwiftUI

/// Plays what the avatar's state machine asks for: one haptic per moment,
/// VoiceOver announcements, and the call's few sounds when the sound
/// director allows them and Sounds is on.
@MainActor
final class CallFeedback {
    private let haptics = CoreHapticsPlayer()
    private var director = EarconDirector()
    private var players: [String: AVAudioPlayer] = [:]
    private let started = ContinuousClock.now
    /// Who's speaking right now; set once the call exists.
    var isSomeoneSpeaking: () -> (agent: Bool, user: Bool) = { (false, false) }

    static let soundsKey = "ferni.earcons"

    func newCall() { director.newCall() }

    func play(_ effect: AvatarEffect) {
        switch effect {
        case .haptic(let cue):
            haptics.play(cue)
        case .announce(let text):
            AccessibilityNotification.Announcement(text).post()
        case .earcon(let earcon):
            guard UserDefaults.standard.object(forKey: Self.soundsKey) as? Bool ?? true else { return }
            let speaking = isSomeoneSpeaking()
            guard director.allow(earcon, now: ContinuousClock.now - started,
                                 agentSpeaking: speaking.agent, userSpeaking: speaking.user) else { return }
            player(for: earcon.fileName)?.play()
        }
    }

    /// The feedback for a cue from Ferni's body: the join's note and landing
    /// tap, and a touch's soft tap. The others stay silent.
    nonisolated static func effect(for cue: KeyedCue) -> AvatarEffect? {
        switch cue {
        case .arrivalChime: .earcon(.arrival)
        case .land: .haptic(.presence)
        case .touch: .haptic(.touch)
        default: nil
        }
    }

    /// A cue from Ferni's body (the rig already limits a touch's tap to one every 2 s).
    func play(_ cue: KeyedCue) {
        if let effect = Self.effect(for: cue) { play(effect) } // earcons still pass the sound director's gates
        #if DEBUG
        if cue == .touch { UITestScenario.Counters.shared.touches += 1 }
        #endif
    }

    /// One prepared player per sound, on the call's own audio session.
    private func player(for name: String) -> AVAudioPlayer? {
        if let player = players[name] { return player }
        guard let url = Bundle.main.url(forResource: name, withExtension: "mp3"),
              let player = try? AVAudioPlayer(contentsOf: url) else { return nil }
        player.volume = 0.6
        player.prepareToPlay()
        players[name] = player
        return player
    }
}
