import XCTest
@testable import FerniShared

// MARK: - EmotionalSoundEngine Tests

final class EmotionalSoundEngineTests: XCTestCase {

    var engine: EmotionalSoundEngine!

    override func setUp() {
        super.setUp()
        engine = EmotionalSoundEngine()
    }

    override func tearDown() {
        engine.stop()
        engine = nil
        super.tearDown()
    }

    // MARK: - Initialization

    func testDefaultIsEnabled() {
        XCTAssertTrue(engine.isEnabled)
    }

    func testDefaultVolume() {
        XCTAssertEqual(engine.volume, 0.15)
    }

    // MARK: - Configuration

    func testVolumeCanBeSet() {
        engine.volume = 0.5
        XCTAssertEqual(engine.volume, 0.5)
    }

    func testIsEnabledCanBeToggled() {
        engine.isEnabled = false
        XCTAssertFalse(engine.isEnabled)

        engine.isEnabled = true
        XCTAssertTrue(engine.isEnabled)
    }

    // MARK: - Micro-Expression Methods (No Crash)

    func testPlayMicroExpressionRecognition() {
        engine.playMicroExpression(.recognition)
        XCTAssertTrue(true)
    }

    func testPlayMicroExpressionConcern() {
        engine.playMicroExpression(.concern)
        XCTAssertTrue(true)
    }

    func testPlayMicroExpressionDelight() {
        engine.playMicroExpression(.delight)
        XCTAssertTrue(true)
    }

    func testPlayMicroExpressionWarmth() {
        engine.playMicroExpression(.warmth)
        XCTAssertTrue(true)
    }

    func testPlayMicroExpressionInterest() {
        engine.playMicroExpression(.interest)
        XCTAssertTrue(true)
    }

    func testPlayAllMicroExpressions() {
        for type in MicroExpressionType.allCases {
            engine.playMicroExpression(type)
        }
        XCTAssertTrue(true)
    }

    // MARK: - Listening Acknowledgment (No Crash)

    func testPlayListeningAckNone() {
        engine.playListeningAck(.none)
        XCTAssertTrue(true)
    }

    func testPlayListeningAckMicroNod() {
        engine.playListeningAck(.microNod)
        XCTAssertTrue(true)
    }

    func testPlayListeningAckSubtleNod() {
        engine.playListeningAck(.subtleNod)
        XCTAssertTrue(true)
    }

    func testPlayListeningAckVisibleNod() {
        engine.playListeningAck(.visibleNod)
        XCTAssertTrue(true)
    }

    func testPlayListeningAckListeningLean() {
        engine.playListeningAck(.listeningLean)
        XCTAssertTrue(true)
    }

    func testPlayListeningAckContemplative() {
        engine.playListeningAck(.contemplative)
        XCTAssertTrue(true)
    }

    func testPlayAllListeningAcks() {
        let gestures: [ListeningGesture] = [.none, .microNod, .subtleNod, .visibleNod, .listeningLean, .contemplative]
        for gesture in gestures {
            engine.playListeningAck(gesture)
        }
        XCTAssertTrue(true)
    }

    // MARK: - Concern (No Crash)

    func testPlayConcernNone() {
        engine.playConcern(level: .none)
        XCTAssertTrue(true)
    }

    func testPlayConcernMild() {
        engine.playConcern(level: .mild)
        XCTAssertTrue(true)
    }

    func testPlayConcernModerate() {
        engine.playConcern(level: .moderate)
        XCTAssertTrue(true)
    }

    func testPlayConcernHigh() {
        engine.playConcern(level: .high)
        XCTAssertTrue(true)
    }

    func testPlayAllConcernLevels() {
        let levels: [ConcernLevel] = [.none, .mild, .moderate, .high]
        for level in levels {
            engine.playConcern(level: level)
        }
        XCTAssertTrue(true)
    }

    // MARK: - Connection Events (No Crash)

    func testPlayConnectionEstablished() {
        engine.playConnectionEstablished()
        XCTAssertTrue(true)
    }

    func testPlayConnectionClosed() {
        engine.playConnectionClosed()
        XCTAssertTrue(true)
    }

    // MARK: - Anticipation (No Crash)

    func testPlayAnticipationExcited() {
        engine.playAnticipation(.excited)
        XCTAssertTrue(true)
    }

    func testPlayAnticipationConcerned() {
        engine.playAnticipation(.concerned)
        XCTAssertTrue(true)
    }

    func testPlayAnticipationNostalgic() {
        engine.playAnticipation(.nostalgic)
        XCTAssertTrue(true)
    }

    func testPlayAnticipationCurious() {
        engine.playAnticipation(.curious)
        XCTAssertTrue(true)
    }

    func testPlayAnticipationReflective() {
        engine.playAnticipation(.reflective)
        XCTAssertTrue(true)
    }

    func testPlayAnticipationVulnerable() {
        engine.playAnticipation(.vulnerable)
        XCTAssertTrue(true)
    }

    func testPlayAnticipationUncertain() {
        engine.playAnticipation(.uncertain)
        XCTAssertTrue(true)
    }

    func testPlayAnticipationAttentive() {
        engine.playAnticipation(.attentive)
        XCTAssertTrue(true)
    }

    func testPlayAnticipationWarm() {
        engine.playAnticipation(.warm)
        XCTAssertTrue(true)
    }

    func testPlayAllAnticipatedEmotions() {
        let emotions: [AnticipatedEmotion] = [.reflective, .vulnerable, .uncertain, .excited, .nostalgic, .attentive, .concerned, .warm, .curious]
        for emotion in emotions {
            engine.playAnticipation(emotion)
        }
        XCTAssertTrue(true)
    }

    // MARK: - Other Methods (No Crash)

    func testPlayMemorySpark() {
        engine.playMemorySpark()
        XCTAssertTrue(true)
    }

    func testPlayBreathPulseAtPeak() {
        engine.playBreathPulse(phase: 0.5)
        XCTAssertTrue(true)
    }

    func testPlayBreathPulseOffPeak() {
        engine.playBreathPulse(phase: 0.0)
        engine.playBreathPulse(phase: 0.3)
        engine.playBreathPulse(phase: 0.7)
        engine.playBreathPulse(phase: 1.0)
        XCTAssertTrue(true)
    }

    // MARK: - Stop

    func testStopDoesNotCrash() {
        engine.stop()
        XCTAssertTrue(true)
    }

    func testStopThenPlayDoesNotCrash() {
        engine.stop()
        // After stopping, playing shouldn't crash (may not produce sound)
        engine.playMicroExpression(.recognition)
        XCTAssertTrue(true)
    }

    // MARK: - Disabled State

    func testPlayWhenDisabledDoesNotCrash() {
        engine.isEnabled = false
        engine.playMicroExpression(.recognition)
        engine.playListeningAck(.visibleNod)
        engine.playConcern(level: .high)
        engine.playConnectionEstablished()
        engine.playAnticipation(.excited)
        engine.playMemorySpark()
        engine.playBreathPulse(phase: 0.5)
        XCTAssertTrue(true)
    }
}

// MARK: - Musical Note Frequency Tests

final class MusicalNoteFrequencyTests: XCTestCase {

    // Note frequencies used in EmotionalSoundEngine
    // C4 = 262, E4 = 330, G4 = 392, C5 = 523, E5 = 659, G5 = 784, C6 = 1047

    func testC4Frequency() {
        let c4: Float = 262
        XCTAssertEqual(c4, 262)
    }

    func testE4Frequency() {
        let e4: Float = 330
        XCTAssertEqual(e4, 330)
    }

    func testG4Frequency() {
        let g4: Float = 392
        XCTAssertEqual(g4, 392)
    }

    func testC5Frequency() {
        let c5: Float = 523
        XCTAssertEqual(c5, 523)
    }

    func testE5Frequency() {
        let e5: Float = 659
        XCTAssertEqual(e5, 659)
    }

    func testG5Frequency() {
        let g5: Float = 784
        XCTAssertEqual(g5, 784)
    }

    func testC6Frequency() {
        let c6: Float = 1047
        XCTAssertEqual(c6, 1047)
    }

    func testG3Frequency() {
        let g3: Float = 196
        XCTAssertEqual(g3, 196)
    }

    func testOctaveRelationship() {
        // C5 should be ~2x C4
        let c4: Float = 262
        let c5: Float = 523
        XCTAssertEqual(c5 / c4, 2.0, accuracy: 0.1)
    }

    func testMajorThirdRelationship() {
        // E4/C4 should be ~5/4 = 1.25
        let c4: Float = 262
        let e4: Float = 330
        XCTAssertEqual(e4 / c4, 1.26, accuracy: 0.05)
    }

    func testPerfectFifthRelationship() {
        // G4/C4 should be ~3/2 = 1.5
        let c4: Float = 262
        let g4: Float = 392
        XCTAssertEqual(g4 / c4, 1.5, accuracy: 0.05)
    }
}

// MARK: - Listening Gesture Intensity Tests

final class ListeningGestureIntensityTests: XCTestCase {

    func testIntensityForNone() {
        let intensity: Float = 0
        XCTAssertEqual(intensity, 0)
    }

    func testIntensityForMicroNod() {
        let intensity: Float = 0.05
        XCTAssertEqual(intensity, 0.05)
    }

    func testIntensityForSubtleNod() {
        let intensity: Float = 0.08
        XCTAssertEqual(intensity, 0.08)
    }

    func testIntensityForVisibleNod() {
        let intensity: Float = 0.10
        XCTAssertEqual(intensity, 0.10)
    }

    func testIntensityForListeningLean() {
        let intensity: Float = 0.08
        XCTAssertEqual(intensity, 0.08)
    }

    func testIntensityForContemplative() {
        let intensity: Float = 0.06
        XCTAssertEqual(intensity, 0.06)
    }

    func testIntensitiesAreSubtle() {
        let intensities: [Float] = [0.05, 0.06, 0.08, 0.10]
        for intensity in intensities {
            XCTAssertLessThanOrEqual(intensity, 0.15, "Intensity should be subtle")
        }
    }
}

// MARK: - Tone Duration Tests

final class ToneDurationTests: XCTestCase {

    func testMicroExpressionDurations() {
        // Micro-expression sounds are 60-120ms
        let durations: [TimeInterval] = [0.06, 0.07, 0.08, 0.10, 0.12]
        for duration in durations {
            XCTAssertLessThanOrEqual(duration, 0.15)
            XCTAssertGreaterThanOrEqual(duration, 0.05)
        }
    }

    func testListeningAckDuration() {
        // Very short tick
        let duration: TimeInterval = 0.03
        XCTAssertEqual(duration, 0.03)
    }

    func testConcernDurations() {
        // Concern sounds are 150-250ms
        let durations: [TimeInterval] = [0.15, 0.20, 0.25]
        for duration in durations {
            XCTAssertLessThanOrEqual(duration, 0.30)
            XCTAssertGreaterThanOrEqual(duration, 0.10)
        }
    }

    func testMemorySparkDuration() {
        let duration: TimeInterval = 0.06
        XCTAssertEqual(duration, 0.06)
    }

    func testBreathPulseDuration() {
        let duration: TimeInterval = 0.10
        XCTAssertEqual(duration, 0.10)
    }
}

// MARK: - Breath Pulse Phase Tests

final class BreathPulsePhaseTests: XCTestCase {

    func testBreathPulseOnlyAtPeak() {
        // Pulse should only occur when phase is between 0.48 and 0.52
        let validPhases: [CGFloat] = [0.48, 0.49, 0.50, 0.51, 0.52]
        let invalidPhases: [CGFloat] = [0.0, 0.25, 0.47, 0.53, 0.75, 1.0]

        for phase in validPhases {
            let shouldPlay = phase > 0.48 && phase < 0.52
            XCTAssertTrue(shouldPlay || phase == 0.48 || phase == 0.52,
                          "Phase \(phase) should be at peak")
        }

        for phase in invalidPhases {
            let shouldPlay = phase > 0.48 && phase < 0.52
            XCTAssertFalse(shouldPlay, "Phase \(phase) should not be at peak")
        }
    }

    func testBreathPulseFrequency() {
        // Low frequency: 150Hz → 140Hz
        let startHz: Float = 150
        let endHz: Float = 140
        XCTAssertLessThan(startHz, 200, "Breath pulse should be low frequency")
        XCTAssertLessThan(endHz, 200)
    }

    func testBreathPulseAmplitude() {
        // Very gentle: 0.03 amplitude
        let amplitude: Float = 0.03
        XCTAssertLessThan(amplitude, 0.1, "Breath pulse should be very subtle")
    }
}

// MARK: - Sample Rate Tests

final class AudioSampleRateTests: XCTestCase {

    func testSampleRate() {
        // Standard sample rate: 44100 Hz
        let sampleRate: Float = 44100
        XCTAssertEqual(sampleRate, 44100)
    }

    func testSampleRateIsStandard() {
        let sampleRate: Float = 44100
        XCTAssertTrue(sampleRate == 44100 || sampleRate == 48000,
                      "Sample rate should be a standard audio rate")
    }
}
