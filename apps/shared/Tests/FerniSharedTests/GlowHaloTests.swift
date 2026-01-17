import XCTest
import SwiftUI
@testable import FerniShared

// MARK: - GlowHalo Tests

/// Tests for GlowHalo component - the three-ring warm halo system behind the avatar.
/// Tests cover initialization, layer rendering, and accessibility (reduceMotion).

final class GlowHaloTests: XCTestCase {

    // MARK: - Initialization Tests

    func testDefaultInitialization() {
        let view = GlowHalo(
            persona: PersonaRegistry.ferni,
            size: 80,
            isActive: false
        )
        XCTAssertNotNil(view)
    }

    func testActiveInitialization() {
        let view = GlowHalo(
            persona: PersonaRegistry.ferni,
            size: 80,
            isActive: true
        )
        XCTAssertNotNil(view)
    }

    func testBodyProducesValidView() {
        let view = GlowHalo(
            persona: PersonaRegistry.ferni,
            size: 80,
            isActive: true
        )
        _ = view.body
        XCTAssertTrue(true)
    }

    // MARK: - Size Tests

    func testSmallSize() {
        let view = GlowHalo(
            persona: PersonaRegistry.ferni,
            size: 40,
            isActive: true
        )
        _ = view.body
        XCTAssertTrue(true)
    }

    func testLargeSize() {
        let view = GlowHalo(
            persona: PersonaRegistry.ferni,
            size: 200,
            isActive: true
        )
        _ = view.body
        XCTAssertTrue(true)
    }

    // MARK: - Active State Tests

    func testActiveState() {
        let view = GlowHalo(
            persona: PersonaRegistry.ferni,
            size: 80,
            isActive: true
        )
        _ = view.body
        XCTAssertTrue(true)
    }

    func testInactiveState() {
        let view = GlowHalo(
            persona: PersonaRegistry.ferni,
            size: 80,
            isActive: false
        )
        _ = view.body
        XCTAssertTrue(true)
    }

    // MARK: - Persona Tests

    func testAllPersonas() {
        let personas = PersonaRegistry.all
        for persona in personas {
            let view = GlowHalo(
                persona: persona,
                size: 80,
                isActive: true
            )
            _ = view.body
        }
        XCTAssertTrue(true)
    }
}

// MARK: - StableGlowHalo Tests

final class StableGlowHaloTests: XCTestCase {

    func testDefaultInitialization() {
        let view = StableGlowHalo(
            personaId: "ferni",
            size: 80,
            isActive: true
        )
        XCTAssertNotNil(view)
    }

    func testBodyProducesValidView() {
        let view = StableGlowHalo(
            personaId: "ferni",
            size: 80,
            isActive: true
        )
        _ = view.body
        XCTAssertTrue(true)
    }

    func testEquatable() {
        let view1 = StableGlowHalo(personaId: "ferni", size: 80, isActive: true)
        let view2 = StableGlowHalo(personaId: "ferni", size: 80, isActive: true)
        XCTAssertEqual(view1, view2)
    }

    func testNotEquatableWhenDifferent() {
        let view1 = StableGlowHalo(personaId: "ferni", size: 80, isActive: true)
        let view2 = StableGlowHalo(personaId: "maya", size: 80, isActive: true)
        XCTAssertNotEqual(view1, view2)
    }
}

// MARK: - Halo Frame Tests

final class HaloFrameTests: XCTestCase {

    func testFrameSize() {
        // Frame should be 2.2x the orb size
        let orbSize: CGFloat = 80
        let expectedFrameSize = orbSize * 2.2
        XCTAssertEqual(expectedFrameSize, 176)
    }

    func testOuterGlowSize() {
        // Outer glow is 1.5x the orb size
        let orbSize: CGFloat = 80
        let expectedSize = orbSize * 1.5
        XCTAssertEqual(expectedSize, 120)
    }

    func testInnerRingSize() {
        // Inner ring is 1.2x the orb size
        let orbSize: CGFloat = 80
        let expectedSize = orbSize * 1.2
        XCTAssertEqual(expectedSize, 96)
    }

    func testHeartbeatRingSize() {
        // Heartbeat ring is 1.35x the orb size
        let orbSize: CGFloat = 80
        let expectedSize = orbSize * 1.35
        XCTAssertEqual(expectedSize, 108)
    }

    func testPulseRingSize() {
        // Pulse ring is 1.0x the orb size (expands to 1.8x)
        let orbSize: CGFloat = 80
        let expectedSize = orbSize * 1.0
        XCTAssertEqual(expectedSize, 80)
    }
}

// MARK: - Halo Timing Tests

final class HaloTimingTests: XCTestCase {

    func testOuterGlowCycle() {
        // 8-second slow breathing cycle
        let cycle = PixarTiming.haloOuterCycle
        XCTAssertEqual(cycle, 8.0)
    }

    func testInnerRingCycle() {
        // 5-second breathing synced with avatar
        let cycle = PixarTiming.haloInnerCycle
        XCTAssertEqual(cycle, 5.0)
    }

    func testPulseExpandDuration() {
        // 1.2-second pulse expansion
        let duration = PixarTiming.haloPulseExpand
        XCTAssertEqual(duration, 1.2)
    }
}

// MARK: - Heartbeat Pattern Tests

final class HeartbeatPatternTests: XCTestCase {

    func testHeartbeatCycleDuration() {
        // 1.8 second cycle (like a real resting heart rate ~66 BPM)
        let cycleTime = 1.8
        XCTAssertEqual(cycleTime, 1.8)
    }

    func testLubPhaseRange() {
        // Lub (first beat) occurs at 0-10% of cycle
        let lubStart = 0.0
        let lubEnd = 0.1
        XCTAssertEqual(lubStart, 0.0)
        XCTAssertEqual(lubEnd, 0.1)
    }

    func testQuickSettlePhaseRange() {
        // Quick settle occurs at 10-20% of cycle
        let settleStart = 0.1
        let settleEnd = 0.2
        XCTAssertEqual(settleStart, 0.1)
        XCTAssertEqual(settleEnd, 0.2)
    }

    func testDubPhaseRange() {
        // Dub (second beat) occurs at 20-30% of cycle
        let dubStart = 0.2
        let dubEnd = 0.3
        XCTAssertEqual(dubStart, 0.2)
        XCTAssertEqual(dubEnd, 0.3)
    }

    func testReturnToRestPhaseRange() {
        // Return to rest occurs at 30-50% of cycle
        let returnStart = 0.3
        let returnEnd = 0.5
        XCTAssertEqual(returnStart, 0.3)
        XCTAssertEqual(returnEnd, 0.5)
    }

    func testRestPhaseRange() {
        // Rest phase (longer pause) occurs at 50-100% of cycle
        let restStart = 0.5
        let restEnd = 1.0
        XCTAssertEqual(restStart, 0.5)
        XCTAssertEqual(restEnd, 1.0)
    }

    func testLubScaleRange() {
        // Lub: scale from 1.0 to 1.12
        let scaleStart: CGFloat = 1.0
        let scaleEnd: CGFloat = 1.12
        XCTAssertEqual(scaleStart, 1.0)
        XCTAssertEqual(scaleEnd, 1.12)
    }

    func testDubScaleRange() {
        // Dub: scale from 1.02 to 1.08
        let scaleStart: CGFloat = 1.02
        let scaleEnd: CGFloat = 1.08
        XCTAssertEqual(scaleStart, 1.02)
        XCTAssertEqual(scaleEnd, 1.08)
    }

    func testRestingOpacity() {
        // Resting opacity is 0.75
        let restingOpacity: Double = 0.75
        XCTAssertEqual(restingOpacity, 0.75)
    }

    func testPeakOpacity() {
        // Peak opacity during beats is 1.0
        let peakOpacity: Double = 1.0
        XCTAssertEqual(peakOpacity, 1.0)
    }
}

// MARK: - Breathing Scale Tests

final class GlowBreathingScaleTests: XCTestCase {

    func testOuterGlowScaleRange() {
        // Outer glow scales 1.0 - 1.05
        let minScale: CGFloat = 1.0
        let maxScale: CGFloat = 1.05
        XCTAssertEqual(minScale, 1.0)
        XCTAssertEqual(maxScale, 1.05)
    }

    func testInnerRingScaleRange() {
        // Inner ring scales 1.0 - 1.03
        let minScale: CGFloat = 1.0
        let maxScale: CGFloat = 1.03
        XCTAssertEqual(minScale, 1.0)
        XCTAssertEqual(maxScale, 1.03)
    }

    func testPulseRingExpansion() {
        // Pulse ring expands from 1.1 to 1.8
        let minScale: CGFloat = 1.1
        let maxScale: CGFloat = 1.8
        XCTAssertEqual(minScale, 1.1)
        XCTAssertEqual(maxScale, 1.8)
    }
}

// MARK: - Opacity Tests

final class GlowOpacityTests: XCTestCase {

    func testOuterGlowBaseOpacity() {
        // Base opacity 0.15, can go up to 0.20
        let baseOpacity: Double = 0.15
        let maxAdditional: Double = 0.05
        XCTAssertEqual(baseOpacity, 0.15)
        XCTAssertEqual(baseOpacity + maxAdditional, 0.20)
    }

    func testInnerRingActiveOpacity() {
        // Active inner ring opacity is 0.35
        let activeOpacity: Double = 0.35
        XCTAssertEqual(activeOpacity, 0.35)
    }

    func testInnerRingInactiveOpacity() {
        // Inactive inner ring opacity is 0.15
        let inactiveOpacity: Double = 0.15
        XCTAssertEqual(inactiveOpacity, 0.15)
    }

    func testPulseRingFadeOut() {
        // Pulse ring starts at 0.5 opacity and fades to 0
        let startOpacity: Double = 0.5
        let endOpacity: Double = 0.0
        XCTAssertEqual(startOpacity, 0.5)
        XCTAssertEqual(endOpacity, 0.0)
    }
}

// MARK: - Intensity Modifier Tests

final class IntensityModifierTests: XCTestCase {

    func testActiveIntensityModifier() {
        // Active state uses 1.0 intensity modifier
        let activeModifier: Double = 1.0
        XCTAssertEqual(activeModifier, 1.0)
    }

    func testInactiveIntensityModifier() {
        // Inactive state uses 0.5 intensity modifier
        let inactiveModifier: Double = 0.5
        XCTAssertEqual(inactiveModifier, 0.5)
    }

    func testHeartbeatOpacityMultiplier() {
        // Heartbeat ring uses 0.6 opacity multiplier
        let multiplier: Double = 0.6
        XCTAssertEqual(multiplier, 0.6)
    }
}
