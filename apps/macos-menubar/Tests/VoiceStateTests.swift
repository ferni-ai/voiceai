import XCTest
@testable import FerniVoice

// MARK: - Voice State Tests

final class VoiceStateTests: XCTestCase {
    
    // MARK: - State Properties
    
    func testStateTitles() {
        XCTAssertEqual(VoiceState.disconnected.title, "Ready")
        XCTAssertEqual(VoiceState.connecting.title, "Connecting...")
        XCTAssertEqual(VoiceState.connected.title, "Connected")
        XCTAssertEqual(VoiceState.listening.title, "Listening")
        XCTAssertEqual(VoiceState.speaking.title, "Speaking")
        XCTAssertEqual(VoiceState.thinking.title, "Thinking")
        XCTAssertEqual(VoiceState.error("test").title, "Connection Issue")
    }
    
    func testIsActiveState() {
        XCTAssertFalse(VoiceState.disconnected.isActive)
        XCTAssertFalse(VoiceState.error("test").isActive)
        
        XCTAssertTrue(VoiceState.connecting.isActive)
        XCTAssertTrue(VoiceState.connected.isActive)
        XCTAssertTrue(VoiceState.listening.isActive)
        XCTAssertTrue(VoiceState.speaking.isActive)
        XCTAssertTrue(VoiceState.thinking.isActive)
    }
    
    func testShowWaveform() {
        XCTAssertFalse(VoiceState.disconnected.showWaveform)
        XCTAssertFalse(VoiceState.connecting.showWaveform)
        XCTAssertFalse(VoiceState.thinking.showWaveform)
        XCTAssertFalse(VoiceState.error("test").showWaveform)
        
        XCTAssertTrue(VoiceState.connected.showWaveform)
        XCTAssertTrue(VoiceState.listening.showWaveform)
        XCTAssertTrue(VoiceState.speaking.showWaveform)
    }
    
    func testBreathingIntensity() {
        XCTAssertEqual(VoiceState.speaking.breathingIntensity, 1.5)
        XCTAssertEqual(VoiceState.listening.breathingIntensity, 1.2)
        XCTAssertEqual(VoiceState.connected.breathingIntensity, 1.0)
        XCTAssertEqual(VoiceState.thinking.breathingIntensity, 0.8)
        XCTAssertEqual(VoiceState.disconnected.breathingIntensity, 0.6)
    }
    
    // MARK: - State Equality
    
    func testStateEquality() {
        XCTAssertEqual(VoiceState.disconnected, VoiceState.disconnected)
        XCTAssertEqual(VoiceState.connected, VoiceState.connected)
        XCTAssertNotEqual(VoiceState.connected, VoiceState.listening)
    }
    
    func testErrorStateEquality() {
        let error1 = VoiceState.error("test")
        let error2 = VoiceState.error("test")
        let error3 = VoiceState.error("different")
        
        XCTAssertEqual(error1, error2)
        XCTAssertNotEqual(error1, error3)
    }
}

// MARK: - Audio Level Sample Tests

final class AudioLevelSampleTests: XCTestCase {
    
    func testSampleCreation() {
        let sample = AudioLevelSample(level: 0.5)
        XCTAssertEqual(sample.level, 0.5)
        XCTAssertNotNil(sample.id)
        XCTAssertNotNil(sample.timestamp)
    }
    
    func testSampleClamping() {
        let lowSample = AudioLevelSample(level: -0.5)
        XCTAssertEqual(lowSample.level, 0.0)
        
        let highSample = AudioLevelSample(level: 1.5)
        XCTAssertEqual(highSample.level, 1.0)
    }
    
    func testSampleUniqueIds() {
        let sample1 = AudioLevelSample(level: 0.5)
        let sample2 = AudioLevelSample(level: 0.5)
        XCTAssertNotEqual(sample1.id, sample2.id)
    }
}

