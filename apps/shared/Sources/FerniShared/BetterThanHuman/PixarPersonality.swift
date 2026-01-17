import SwiftUI
import Combine

// MARK: - Pixar Personality Engine
/// Adds Luxo Jr.-inspired personality to the orb.
///
/// Pixar's Animation Principles Applied:
/// 1. **Anticipation** - Small windup before big moves
/// 2. **Squash & Stretch** - Physical weight through deformation
/// 3. **Follow Through** - Parts that continue after main action stops
/// 4. **Secondary Action** - Supporting movements that add life
/// 5. **Appeal** - The intangible "cute factor"
///
/// This engine generates continuous personality behaviors:
/// - Eye blinks
/// - Curious head tilts
/// - Idle fidgets
/// - Attention shifts
/// - Emotional flourishes

public class PixarPersonalityEngine: ObservableObject {

    // MARK: - Published State

    /// Current eye state
    @Published public private(set) var eyeState: EyeState = .open

    /// Blink progress (0 = open, 1 = closed)
    @Published public private(set) var blinkProgress: CGFloat = 0

    /// Eye look direction (-1 to 1 on each axis)
    @Published public private(set) var eyeLookDirection: CGPoint = .zero

    /// Current personality behavior
    @Published public private(set) var currentBehavior: PersonalityBehavior = .idle

    /// Curious lean amount (-1 to 1)
    @Published public private(set) var curiousLean: CGFloat = 0

    /// Fidget offset (small random movements)
    @Published public private(set) var fidgetOffset: CGPoint = .zero

    /// Eyebrow position (-1 = worried, 0 = neutral, 1 = raised/excited)
    @Published public private(set) var eyebrowPosition: CGFloat = 0

    /// Squish factor for cute squash/stretch
    @Published public private(set) var squishFactor: CGFloat = 0

    /// Whether the orb is currently "awake" and active
    @Published public var isAwake: Bool = true {
        didSet {
            if isAwake {
                wakeUp()
            } else {
                sleep()
            }
        }
    }

    // MARK: - Configuration

    /// How often to trigger random behaviors (seconds)
    public var behaviorInterval: TimeInterval = 4.0

    /// How often to blink (average seconds between blinks)
    public var blinkInterval: TimeInterval = 3.5

    /// Personality "energy" level (0 = calm, 1 = energetic)
    public var energyLevel: CGFloat = 0.5 {
        didSet {
            adjustBehaviorRate()
        }
    }

    // MARK: - Private State

    private var blinkTimer: Timer?
    private var behaviorTimer: Timer?
    private var fidgetTimer: Timer?
    private var cancellables = Set<AnyCancellable>()
    private var lastBlinkTime: Date = Date()
    private var isAnimating = false

    // MARK: - Initialization

    public init() {
        start()
    }

    // MARK: - Lifecycle

    public func start() {
        guard !isAnimating else { return }
        isAnimating = true

        startBlinking()
        startRandomBehaviors()
        startFidgeting()
    }

    public func stop() {
        isAnimating = false
        blinkTimer?.invalidate()
        behaviorTimer?.invalidate()
        fidgetTimer?.invalidate()
    }

    // MARK: - Blinking

    private func startBlinking() {
        blinkTimer?.invalidate()

        // Schedule next blink with random variation
        let nextBlink = blinkInterval * (0.6 + Double.random(in: 0...0.8))
        blinkTimer = Timer.scheduledTimer(withTimeInterval: nextBlink, repeats: false) { [weak self] _ in
            self?.performBlink()
        }
    }

    private func performBlink() {
        guard isAwake else {
            startBlinking()
            return
        }

        // Occasionally do a double-blink (more natural)
        let isDoubleBlink = Double.random(in: 0...1) < 0.2

        animateBlink()

        if isDoubleBlink {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) { [weak self] in
                self?.animateBlink()
            }
        }

        lastBlinkTime = Date()
        startBlinking()
    }

    private func animateBlink() {
        eyeState = .blinking

        // Quick close
        withAnimation(.easeIn(duration: 0.06)) {
            blinkProgress = 1.0
        }

        // Quick open
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.08) { [weak self] in
            withAnimation(.easeOut(duration: 0.08)) {
                self?.blinkProgress = 0.0
                self?.eyeState = .open
            }
        }
    }

    /// Trigger a blink on demand (e.g., when something surprising happens)
    public func triggerBlink() {
        performBlink()
    }

    /// Trigger surprised wide eyes
    public func triggerSurprise() {
        eyeState = .wide

        withAnimation(.spring(response: 0.2, dampingFraction: 0.5)) {
            eyebrowPosition = 0.8
            squishFactor = -0.1  // Stretch tall (surprise)
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
            withAnimation(.easeOut(duration: 0.3)) {
                self?.eyeState = .open
                self?.eyebrowPosition = 0
                self?.squishFactor = 0
            }
        }
    }

    // MARK: - Random Behaviors

    private func startRandomBehaviors() {
        behaviorTimer?.invalidate()

        let nextBehavior = behaviorInterval * (0.5 + Double.random(in: 0...1))
        behaviorTimer = Timer.scheduledTimer(withTimeInterval: nextBehavior, repeats: false) { [weak self] _ in
            self?.performRandomBehavior()
        }
    }

    private func performRandomBehavior() {
        guard isAwake else {
            startRandomBehaviors()
            return
        }

        // Weight behaviors by energy level
        let behavior = selectRandomBehavior()
        currentBehavior = behavior

        executeBehavior(behavior)

        startRandomBehaviors()
    }

    private func selectRandomBehavior() -> PersonalityBehavior {
        let roll = Double.random(in: 0...1)

        // Higher energy = more active behaviors
        if energyLevel > 0.7 {
            switch roll {
            case 0..<0.25: return .curiousLook
            case 0.25..<0.45: return .excitedBounce
            case 0.45..<0.6: return .attentionShift
            case 0.6..<0.75: return .happyWiggle
            default: return .idle
            }
        } else if energyLevel > 0.3 {
            switch roll {
            case 0..<0.3: return .curiousLook
            case 0.3..<0.5: return .attentionShift
            case 0.5..<0.65: return .thoughtfulPause
            default: return .idle
            }
        } else {
            // Low energy - mostly calm
            switch roll {
            case 0..<0.2: return .gentleNod
            case 0.2..<0.4: return .thoughtfulPause
            default: return .idle
            }
        }
    }

    private func executeBehavior(_ behavior: PersonalityBehavior) {
        switch behavior {
        case .idle:
            break

        case .curiousLook:
            performCuriousLook()

        case .attentionShift:
            performAttentionShift()

        case .excitedBounce:
            performExcitedBounce()

        case .thoughtfulPause:
            performThoughtfulPause()

        case .happyWiggle:
            performHappyWiggle()

        case .gentleNod:
            performGentleNod()

        case .shyHide:
            performShyHide()
        }
    }

    // MARK: - Behavior Implementations

    private func performCuriousLook() {
        // Tilt head and look in a direction
        let direction = CGFloat.random(in: -0.7...0.7)

        withAnimation(.spring(response: 0.4, dampingFraction: 0.6)) {
            curiousLean = direction * 8  // Degrees
            eyeLookDirection = CGPoint(x: direction, y: 0.2)
            eyebrowPosition = 0.3  // Slight raise
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) { [weak self] in
            withAnimation(.easeOut(duration: 0.5)) {
                self?.curiousLean = 0
                self?.eyeLookDirection = .zero
                self?.eyebrowPosition = 0
                self?.currentBehavior = .idle
            }
        }
    }

    private func performAttentionShift() {
        // Quick eye movement to look at something
        let direction = CGPoint(
            x: CGFloat.random(in: -0.8...0.8),
            y: CGFloat.random(in: -0.3...0.3)
        )

        withAnimation(.spring(response: 0.15, dampingFraction: 0.6)) {
            eyeLookDirection = direction
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) { [weak self] in
            withAnimation(.easeOut(duration: 0.3)) {
                self?.eyeLookDirection = .zero
                self?.currentBehavior = .idle
            }
        }
    }

    private func performExcitedBounce() {
        // Squash-stretch bounce with wide eyes
        eyeState = .wide

        // Anticipation (squash down)
        withAnimation(.easeIn(duration: 0.1)) {
            squishFactor = 0.15
            eyebrowPosition = 0.5
        }

        // Bounce up (stretch)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { [weak self] in
            withAnimation(.spring(response: 0.3, dampingFraction: 0.4)) {
                self?.squishFactor = -0.12
            }
        }

        // Settle
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { [weak self] in
            withAnimation(.spring(response: 0.3, dampingFraction: 0.6)) {
                self?.squishFactor = 0
                self?.eyebrowPosition = 0
                self?.eyeState = .open
                self?.currentBehavior = .idle
            }
        }
    }

    private func performThoughtfulPause() {
        // Look up and to the side, slight head tilt
        withAnimation(.easeInOut(duration: 0.4)) {
            eyeLookDirection = CGPoint(x: 0.4, y: -0.5)
            curiousLean = -5
            eyebrowPosition = -0.2  // Slight furrow
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { [weak self] in
            withAnimation(.easeOut(duration: 0.4)) {
                self?.eyeLookDirection = .zero
                self?.curiousLean = 0
                self?.eyebrowPosition = 0
                self?.currentBehavior = .idle
            }
        }
    }

    private func performHappyWiggle() {
        // Quick side-to-side wiggle
        for i in 0..<3 {
            let delay = Double(i) * 0.12
            let direction: CGFloat = i % 2 == 0 ? 1 : -1

            DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
                withAnimation(.spring(response: 0.1, dampingFraction: 0.3)) {
                    self?.curiousLean = direction * 4
                }
            }
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { [weak self] in
            withAnimation(.easeOut(duration: 0.2)) {
                self?.curiousLean = 0
                self?.currentBehavior = .idle
            }
        }
    }

    private func performGentleNod() {
        // Subtle acknowledgment nod
        withAnimation(.easeOut(duration: 0.2)) {
            squishFactor = 0.05
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) { [weak self] in
            withAnimation(.spring(response: 0.3, dampingFraction: 0.6)) {
                self?.squishFactor = -0.03
            }
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
            withAnimation(.easeOut(duration: 0.2)) {
                self?.squishFactor = 0
                self?.currentBehavior = .idle
            }
        }
    }

    private func performShyHide() {
        // Squish down and look away
        withAnimation(.spring(response: 0.3, dampingFraction: 0.5)) {
            squishFactor = 0.2
            eyeLookDirection = CGPoint(x: -0.6, y: 0.3)
            curiousLean = -8
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) { [weak self] in
            withAnimation(.easeOut(duration: 0.4)) {
                self?.squishFactor = 0
                self?.eyeLookDirection = .zero
                self?.curiousLean = 0
                self?.currentBehavior = .idle
            }
        }
    }

    // MARK: - Fidgeting

    private func startFidgeting() {
        fidgetTimer?.invalidate()

        fidgetTimer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in
            self?.updateFidget()
        }
    }

    private func updateFidget() {
        guard isAwake else {
            fidgetOffset = .zero
            return
        }

        // Subtle random micro-movements
        let magnitude: CGFloat = 0.5 * energyLevel

        withAnimation(.easeInOut(duration: 0.5)) {
            fidgetOffset = CGPoint(
                x: CGFloat.random(in: -magnitude...magnitude),
                y: CGFloat.random(in: -magnitude...magnitude)
            )
        }
    }

    // MARK: - Sleep/Wake

    private func wakeUp() {
        // Stretch awake animation
        eyeState = .opening

        withAnimation(.easeOut(duration: 0.4)) {
            blinkProgress = 0.7
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { [weak self] in
            withAnimation(.spring(response: 0.3, dampingFraction: 0.5)) {
                self?.blinkProgress = 0
                self?.squishFactor = -0.05  // Slight stretch
            }
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { [weak self] in
            withAnimation(.easeOut(duration: 0.2)) {
                self?.squishFactor = 0
                self?.eyeState = .open
            }
            self?.start()
        }
    }

    private func sleep() {
        stop()

        // Sleepy close eyes
        withAnimation(.easeInOut(duration: 0.6)) {
            blinkProgress = 1.0
            eyeState = .closed
            eyeLookDirection = .zero
            curiousLean = 0
            eyebrowPosition = -0.3
        }
    }

    // MARK: - External Triggers

    /// Trigger when something interesting happens (user starts speaking, etc.)
    public func onSomethingInteresting() {
        guard isAwake else { return }

        // Look toward the sound/action
        withAnimation(.spring(response: 0.2, dampingFraction: 0.6)) {
            eyeLookDirection = CGPoint(x: 0, y: -0.3)
            eyebrowPosition = 0.2
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) { [weak self] in
            withAnimation(.easeOut(duration: 0.3)) {
                self?.eyeLookDirection = .zero
                self?.eyebrowPosition = 0
            }
        }
    }

    /// React to user finishing speaking
    public func onUserFinishedSpeaking() {
        performGentleNod()
    }

    /// Express empathy
    public func expressEmpathy() {
        withAnimation(.easeInOut(duration: 0.3)) {
            eyebrowPosition = -0.4  // Concerned brow
            curiousLean = -3
            eyeLookDirection = CGPoint(x: 0, y: 0.2)
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { [weak self] in
            withAnimation(.easeOut(duration: 0.4)) {
                self?.eyebrowPosition = 0
                self?.curiousLean = 0
                self?.eyeLookDirection = .zero
            }
        }
    }

    /// Express delight
    public func expressDelight() {
        performExcitedBounce()
    }

    // MARK: - Helpers

    private func adjustBehaviorRate() {
        // Higher energy = more frequent behaviors
        behaviorInterval = 5.0 - (energyLevel * 3.0)  // 2-5 seconds
        blinkInterval = 4.0 - (energyLevel * 1.5)     // 2.5-4 seconds
    }

    deinit {
        stop()
    }
}

// MARK: - Eye State

public enum EyeState: String, Equatable {
    case open
    case closed
    case blinking
    case wide       // Surprised/excited
    case squinting  // Suspicious/thinking
    case opening    // Waking up
}

// MARK: - Personality Behaviors

public enum PersonalityBehavior: String, CaseIterable {
    case idle
    case curiousLook      // Tilt head and look around
    case attentionShift   // Quick eye movement
    case excitedBounce    // Happy squash-stretch
    case thoughtfulPause  // Look up, thinking
    case happyWiggle      // Side-to-side wiggle
    case gentleNod        // Subtle acknowledgment
    case shyHide          // Squish down, look away
}

// MARK: - Preview

#if DEBUG
struct PixarPersonalityPreview: View {
    @StateObject private var personality = PixarPersonalityEngine()

    var body: some View {
        VStack(spacing: 20) {
            // Simple orb representation
            ZStack {
                Circle()
                    .fill(Color.green)
                    .frame(width: 100, height: 100)
                    .scaleEffect(
                        x: 1 - personality.squishFactor * 0.3,
                        y: 1 + personality.squishFactor * 0.3
                    )
                    .rotationEffect(.degrees(Double(personality.curiousLean)))
                    .offset(x: personality.fidgetOffset.x, y: personality.fidgetOffset.y)

                // Eyes
                HStack(spacing: 15) {
                    Eye(blinkProgress: personality.blinkProgress, lookDirection: personality.eyeLookDirection)
                    Eye(blinkProgress: personality.blinkProgress, lookDirection: personality.eyeLookDirection)
                }
                .offset(
                    x: personality.eyeLookDirection.x * 5,
                    y: personality.eyeLookDirection.y * 3 - 5
                )
            }

            Text("Behavior: \(personality.currentBehavior.rawValue)")
                .font(.caption)

            HStack {
                Button("Surprise") { personality.triggerSurprise() }
                Button("Blink") { personality.triggerBlink() }
                Button("Delight") { personality.expressDelight() }
            }
            .buttonStyle(.borderedProminent)
        }
        .padding()
    }
}

struct Eye: View {
    let blinkProgress: CGFloat
    let lookDirection: CGPoint

    var body: some View {
        ZStack {
            // Eye white
            Ellipse()
                .fill(.white)
                .frame(width: 16, height: 20 * (1 - blinkProgress))

            // Pupil
            Circle()
                .fill(.black)
                .frame(width: 8, height: 8)
                .offset(
                    x: lookDirection.x * 3,
                    y: lookDirection.y * 3
                )
                .opacity(blinkProgress < 0.5 ? 1 : 0)
        }
    }
}

#Preview {
    PixarPersonalityPreview()
}
#endif
