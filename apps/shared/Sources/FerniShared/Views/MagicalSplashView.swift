import SwiftUI

// MARK: - Magical Splash View
/// A Pixar-inspired splash screen where Ferni's eyes "wake up" and discover the user.
///
/// Animation Sequence (like a character coming to life):
/// 0. INSTANT: Stars twinkle, particles float, glow breathes (frame 1!)
/// 1. Eyes peek from bottom corner (0-500ms) - curiosity
/// 2. Eyes retreat briefly (500-700ms) - playful anticipation
/// 3. Luxo Jr. bounce entrance (700-1700ms) - the grand entrance!
/// 4. Eyes slowly open from sleep (1700-2100ms) - awakening
/// 5. Eyes look around curiously (2100-2700ms) - discovery
/// 6. Eyes focus on user with sparkle (2700-3000ms) - recognition!
/// 7. Initials fade in below (3000-3300ms) - identity
/// 8. Greeting appears (3300-3700ms) - connection
/// 9. Gentle blink, then complete
///
/// Design Philosophy:
/// - NEVER a black screen - instant visual interest from frame 1
/// - The eyes ARE the character - no logo needed
/// - Every animation beat has emotional purpose
/// - Luxo Jr. quality: personality through motion alone
/// - Respects reduced motion preferences

public struct MagicalSplashView: View {

    // MARK: - Configuration

    /// Callback when splash animation completes
    public var onComplete: (() -> Void)?

    /// Whether to show returning user messaging
    public var isReturningUser: Bool = false

    /// User's name for personalized greeting (if available)
    public var userName: String?

    /// Persona color (defaults to Ferni green)
    public var personaColor: Color = Color(hexString: "4a6741")

    // MARK: - Animation State

    @State private var phase: SplashPhase = .initial

    // Luxo Jr. bounce entrance states
    @State private var characterOffset: CGFloat = 400       // Starts below screen
    @State private var characterScaleX: CGFloat = 1.0       // Squash/stretch X
    @State private var characterScaleY: CGFloat = 1.0       // Squash/stretch Y
    @State private var characterRotation: CGFloat = 0       // Tilt during bounce
    @State private var bounceCount: Int = 0                 // Track bounce number

    // Eye animation states
    @State private var eyesVisible: Bool = false
    @State private var eyeOpenness: CGFloat = 0  // 0 = closed, 1 = fully open
    @State private var eyeScale: CGFloat = 0.6
    @State private var eyeVerticalStretch: CGFloat = 0.3  // Squashed when waking
    @State private var lookDirection: CGPoint = .zero
    @State private var sparkleIntensity: CGFloat = 0
    @State private var eyeTilt: CGFloat = 0

    // Peek eye states (curious eye peeking from corner before entrance)
    @State private var peekEyeVisible: Bool = false
    @State private var peekEyeOffset: CGFloat = 100        // How far off-screen
    @State private var peekEyeOpenness: CGFloat = 0.7
    @State private var peekEyeLookUp: CGFloat = 0          // Looking up at user

    // Ambient effects - START VISIBLE for instant feedback!
    @State private var glowIntensity: CGFloat = 0.3        // Start with some glow
    @State private var glowPulse: CGFloat = 0
    @State private var glowBreathing: Bool = false
    @State private var particleOpacity: CGFloat = 0.4      // Start with particles visible
    @State private var starsVisible: Bool = true           // Twinkling stars from frame 1

    // Initials
    @State private var initialsOpacity: CGFloat = 0
    @State private var initialsScale: CGFloat = 0.8

    // Text
    @State private var greetingOpacity: CGFloat = 0
    @State private var greetingOffset: CGFloat = 15
    @State private var subtitleOpacity: CGFloat = 0

    // MARK: - Environment

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    // MARK: - Constants

    private let eyeSize: CGFloat = 160  // Larger for splash impact

    public init(
        onComplete: (() -> Void)? = nil,
        isReturningUser: Bool = false,
        userName: String? = nil,
        personaColor: Color = Color(hexString: "4a6741")
    ) {
        self.onComplete = onComplete
        self.isReturningUser = isReturningUser
        self.userName = userName
        self.personaColor = personaColor
    }

    public var body: some View {
        ZStack {
            // Layer 1: Deep background
            backgroundGradient

            // Layer 2: Twinkling stars (instant visual interest!)
            if starsVisible && !reduceMotion {
                twinklingStars
            }

            // Layer 3: Ambient glow (breathing from frame 1)
            ambientGlow

            // Layer 4: Floating particles (magic dust - visible immediately)
            if !reduceMotion {
                magicParticles
            }

            // Layer 5: Peeking eye from corner (playful curiosity)
            if peekEyeVisible && !reduceMotion {
                peekingEye
            }

            // Layer 6: Main content with Luxo Jr. bounce entrance
            VStack(spacing: 0) {
                Spacer()

                // The Eyes - the soul of Ferni (with Luxo Jr. bounce transforms)
                eyesView
                    .scaleEffect(eyeScale)
                    .scaleEffect(x: characterScaleX, y: characterScaleY)
                    .rotationEffect(.degrees(Double(characterRotation)))
                    .offset(y: characterOffset)
                    .opacity(eyesVisible ? 1 : 0)
                    .accessibilityLabel("Ferni waking up")
                    .accessibilityAddTraits(.isImage)

                // Initials below eyes (also bounces in)
                initialsView
                    .padding(.top, 16)
                    .offset(y: characterOffset > 0 ? characterOffset * 0.8 : 0)
                    .accessibilityLabel("Ferni")

                // Greeting text
                greetingView
                    .padding(.top, 40)
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel("\(greetingText). \(subtitleText)")

                Spacer()
                Spacer()
            }
        }
        .onAppear {
            // Start ambient effects IMMEDIATELY (no delay!)
            startInstantAmbience()
            // Then start the full sequence
            startMagicalSequence()
        }
    }

    // MARK: - Background

    private var backgroundGradient: some View {
        ZStack {
            // Base dark gradient
            LinearGradient(
                colors: [
                    Color(hexString: "08080f"),
                    Color(hexString: "0f0f18"),
                    Color(hexString: "0a0a12")
                ],
                startPoint: .top,
                endPoint: .bottom
            )

            // Subtle vignette
            RadialGradient(
                colors: [
                    Color.clear,
                    Color.black.opacity(0.3)
                ],
                center: .center,
                startRadius: 100,
                endRadius: 400
            )
        }
        .ignoresSafeArea()
    }

    // MARK: - Ambient Glow

    private var ambientGlow: some View {
        ZStack {
            // Primary glow
            Circle()
                .fill(
                    RadialGradient(
                        colors: [
                            personaColor.opacity(0.4 * glowIntensity),
                            personaColor.opacity(0.15 * glowIntensity),
                            personaColor.opacity(0.05 * glowIntensity),
                            Color.clear
                        ],
                        center: .center,
                        startRadius: 20,
                        endRadius: 250
                    )
                )
                .frame(width: 500, height: 500)
                .scaleEffect(1 + glowPulse * 0.1)
                .blur(radius: 40)

            // Secondary warm glow (appears on recognition)
            Circle()
                .fill(
                    RadialGradient(
                        colors: [
                            Color(hexString: "c4a265").opacity(0.3 * sparkleIntensity),
                            Color.clear
                        ],
                        center: .center,
                        startRadius: 0,
                        endRadius: 150
                    )
                )
                .frame(width: 300, height: 300)
                .blur(radius: 30)
        }
        .offset(y: -80)
    }

    // MARK: - Twinkling Stars (Instant Visual Interest!)

    private var twinklingStars: some View {
        GeometryReader { geometry in
            ForEach(0..<20, id: \.self) { index in
                TwinklingStar(
                    index: index,
                    screenSize: geometry.size,
                    personaColor: personaColor
                )
            }
        }
    }

    // MARK: - Peeking Eye (Playful Curiosity)

    private var peekingEye: some View {
        GeometryReader { geometry in
            // Single eye peeking from bottom-right corner
            ZStack {
                // Eye glow
                Ellipse()
                    .fill(
                        RadialGradient(
                            colors: [
                                Color.white.opacity(0.4),
                                Color.white.opacity(0.1),
                                Color.clear
                            ],
                            center: .center,
                            startRadius: 0,
                            endRadius: 30
                        )
                    )
                    .frame(width: 80, height: 50)
                    .blur(radius: 8)

                // Main eye
                Ellipse()
                    .fill(
                        LinearGradient(
                            colors: [Color.white, Color.white.opacity(0.95)],
                            startPoint: .top,
                            endPoint: .bottom
                        )
                    )
                    .frame(width: 36, height: 28 * peekEyeOpenness)
                    .shadow(color: Color.white.opacity(0.5), radius: 4, y: -1)

                // Sparkle
                if peekEyeOpenness > 0.5 {
                    Circle()
                        .fill(Color.white)
                        .frame(width: 8, height: 8)
                        .offset(x: -8, y: -6)
                        .shadow(color: Color.white.opacity(0.8), radius: 2)
                }
            }
            .offset(y: -peekEyeLookUp * 8)  // Looking up animation
            .position(
                x: geometry.size.width - 60,
                y: geometry.size.height - 40 + peekEyeOffset
            )
        }
    }

    // MARK: - Magic Particles

    private var magicParticles: some View {
        GeometryReader { geometry in
            ForEach(0..<12, id: \.self) { index in
                MagicParticle(
                    index: index,
                    personaColor: personaColor,
                    screenSize: geometry.size,
                    startVisible: true  // Start visible immediately!
                )
                .opacity(particleOpacity)
            }
        }
    }

    // MARK: - The Eyes

    private var eyesView: some View {
        ZStack {
            // Outer glow behind eyes
            Ellipse()
                .fill(
                    RadialGradient(
                        colors: [
                            Color.white.opacity(0.15 * eyeOpenness),
                            Color.clear
                        ],
                        center: .center,
                        startRadius: 0,
                        endRadius: eyeSize * 0.8
                    )
                )
                .frame(width: eyeSize * 2, height: eyeSize * 1.2)
                .blur(radius: 20)

            // The two eyes
            HStack(spacing: eyeSize * 0.15) {
                singleMagicalEye(isLeft: true)
                singleMagicalEye(isLeft: false)
            }
            .offset(
                x: lookDirection.x * eyeSize * 0.06,
                y: lookDirection.y * eyeSize * 0.03
            )
        }
    }

    private func singleMagicalEye(isLeft: Bool) -> some View {
        let tiltAngle = eyeTilt * (isLeft ? -6 : 6)
        let eyeWidth = eyeSize * 0.28
        let eyeHeight = eyeSize * 0.34 * eyeVerticalStretch * eyeOpenness

        return ZStack {
            // Eye glow
            Ellipse()
                .fill(
                    RadialGradient(
                        colors: [
                            Color.white.opacity(0.6),
                            Color.white.opacity(0.2),
                            Color.clear
                        ],
                        center: .center,
                        startRadius: 0,
                        endRadius: eyeWidth * 0.9
                    )
                )
                .frame(width: eyeWidth * 1.8, height: max(eyeHeight * 1.5, 4))
                .blur(radius: 6)

            // Main eye oval
            Ellipse()
                .fill(
                    LinearGradient(
                        colors: [
                            Color.white,
                            Color.white.opacity(0.95)
                        ],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                )
                .frame(width: eyeWidth, height: max(eyeHeight, 3))
                .shadow(color: Color.white.opacity(0.5), radius: 4, y: -1)
                .shadow(color: Color.black.opacity(0.1), radius: 2, y: 2)

            // Sparkle highlight
            if eyeOpenness > 0.5 {
                Circle()
                    .fill(Color.white)
                    .frame(width: eyeWidth * 0.18, height: eyeWidth * 0.18)
                    .offset(
                        x: isLeft ? -eyeWidth * 0.2 : -eyeWidth * 0.15,
                        y: -eyeHeight * 0.2
                    )
                    .opacity(Double(sparkleIntensity))
                    .shadow(color: Color.white.opacity(0.8), radius: 2)

                // Secondary sparkle
                Circle()
                    .fill(Color.white.opacity(0.6))
                    .frame(width: eyeWidth * 0.08, height: eyeWidth * 0.08)
                    .offset(
                        x: (isLeft ? -eyeWidth * 0.2 : -eyeWidth * 0.15) + eyeWidth * 0.2,
                        y: -eyeHeight * 0.2 + eyeHeight * 0.15
                    )
                    .opacity(Double(sparkleIntensity) * 0.7)
            }
        }
        .rotationEffect(.degrees(Double(tiltAngle)))
    }

    // MARK: - Initials

    private var initialsView: some View {
        Text("F")
            .font(.system(size: 48, weight: .semibold, design: .rounded))
            .foregroundColor(.white.opacity(0.95))
            .shadow(color: personaColor.opacity(0.5), radius: 8)
            .shadow(color: Color.black.opacity(0.3), radius: 2, y: 1)
            .scaleEffect(initialsScale)
            .opacity(initialsOpacity)
    }

    // MARK: - Greeting

    private var greetingView: some View {
        VStack(spacing: 10) {
            Text(greetingText)
                .font(.system(size: 26, weight: .light, design: .rounded))
                .foregroundColor(.white.opacity(0.95))
                .opacity(greetingOpacity)
                .offset(y: greetingOffset)

            Text(subtitleText)
                .font(.system(size: 15, weight: .regular, design: .rounded))
                .foregroundColor(.white.opacity(0.5))
                .opacity(subtitleOpacity)
        }
        .multilineTextAlignment(.center)
    }

    private var greetingText: String {
        if isReturningUser, let name = userName {
            return "Welcome back, \(name)"
        } else if isReturningUser {
            return "Welcome back"
        } else {
            return "Hello"
        }
    }

    private var subtitleText: String {
        if isReturningUser {
            return "I've been thinking about you"
        } else {
            return "I'm Ferni, your AI companion"
        }
    }

    // MARK: - Instant Ambience (No Black Screen!)

    /// Start ambient effects IMMEDIATELY on appear - no waiting!
    private func startInstantAmbience() {
        // Glow breathing starts right away
        glowBreathing = true
        withAnimation(
            .easeInOut(duration: 2.5)
            .repeatForever(autoreverses: true)
        ) {
            glowIntensity = 0.5
        }

        // Particles are already visible (particleOpacity starts at 0.4)
        // Just add a gentle pulse
        withAnimation(
            .easeInOut(duration: 3.0)
            .repeatForever(autoreverses: true)
        ) {
            particleOpacity = 0.6
        }
    }

    // MARK: - Animation Sequence

    private func startMagicalSequence() {
        if reduceMotion {
            // Skip to final state
            characterOffset = 0
            eyesVisible = true
            eyeScale = 1.0
            eyeOpenness = 1.0
            eyeVerticalStretch = 1.0
            sparkleIntensity = 0.9
            glowIntensity = 1.0
            initialsOpacity = 1.0
            initialsScale = 1.0
            greetingOpacity = 1.0
            greetingOffset = 0
            subtitleOpacity = 1.0
            starsVisible = false
            peekEyeVisible = false

            DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
                onComplete?()
            }
            return
        }

        // ═══════════════════════════════════════════════════════════════
        // PLAYFUL PEEK - Eye peeks from corner before the grand entrance
        // ═══════════════════════════════════════════════════════════════

        // Phase 0: Eye peeks up from bottom corner (0-300ms)
        phase = .peek
        peekEyeVisible = true
        peekEyeOffset = 60  // Mostly hidden

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
            // Eye rises up to peek
            withAnimation(.spring(response: 0.4, dampingFraction: 0.7)) {
                peekEyeOffset = 15  // Peeking up
            }

            // Eye looks up at user
            withAnimation(.easeOut(duration: 0.3).delay(0.2)) {
                peekEyeLookUp = 1.0
            }
        }

        // Phase 0.5: Eye retreats playfully (400-600ms) - "Oh! You saw me!"
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
            // Quick blink of surprise
            withAnimation(.easeIn(duration: 0.08)) {
                peekEyeOpenness = 0.2
            }

            // Eye retreats
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                withAnimation(.spring(response: 0.25, dampingFraction: 0.6)) {
                    peekEyeOffset = 80
                    peekEyeLookUp = 0
                }
            }

            // Hide peek eye
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) {
                peekEyeVisible = false
            }
        }

        // ═══════════════════════════════════════════════════════════════
        // LUXO JR. BOUNCE ENTRANCE - The iconic Pixar lamp hop-hop-hop!
        // ═══════════════════════════════════════════════════════════════

        // Phase 1: Setup & anticipation (700ms mark)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.7) {
            phase = .anticipation
            eyesVisible = true
            eyeOpenness = 0.05  // Eyes just barely visible (sleeping)

            // Intensify glow for entrance
            withAnimation(.easeIn(duration: 0.2)) {
                glowIntensity = 0.6
                particleOpacity = 0.5
            }
        }

        // Phase 2: FIRST BIG HOP (800-1300ms) - Luxo Jr. enters!
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) {
            phase = .bounceEntrance
            performLuxoHop(hopNumber: 1, height: -480, duration: 0.55)
        }

        // Phase 3: SECOND MEDIUM HOP (1300-1700ms)
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.35) {
            performLuxoHop(hopNumber: 2, height: -120, duration: 0.4)
        }

        // Phase 4: THIRD SMALL HOP (1700-2000ms) - Settling bounce
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.75) {
            performLuxoHop(hopNumber: 3, height: -40, duration: 0.3)
        }

        // Phase 5: SETTLE & SQUASH (2000-2200ms) - Final landing
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.05) {
            // Fade out stars as character lands
            withAnimation(.easeOut(duration: 0.5)) {
                starsVisible = false
            }

            // Land with a satisfying squash
            withAnimation(.spring(response: 0.2, dampingFraction: 0.5)) {
                characterOffset = 0
                characterScaleX = 1.06
                characterScaleY = 0.94
            }

            // Return to normal
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                    characterScaleX = 1.0
                    characterScaleY = 1.0
                }
            }
        }

        // ═══════════════════════════════════════════════════════════════
        // EYE AWAKENING SEQUENCE - Now the character "wakes up"
        // ═══════════════════════════════════════════════════════════════

        // Phase 6: Eyes open (2200-2600ms) - "Hello, who's there?"
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.2) {
            phase = .awakening

            withAnimation(.spring(response: 0.5, dampingFraction: 0.7)) {
                eyeScale = 1.0
            }

            // Eyes slowly open (like waking up)
            withAnimation(.easeOut(duration: 0.5)) {
                eyeOpenness = 1.0
                eyeVerticalStretch = 1.0
                glowIntensity = 0.8
            }
        }

        // Phase 7: Look around curiously (2600-3200ms) - "Where am I?"
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.6) {
            phase = .discovery
            startCuriousLooking()
        }

        // Phase 8: Focus on user with recognition (3200-3500ms) - "Oh, it's you!"
        DispatchQueue.main.asyncAfter(deadline: .now() + 3.2) {
            phase = .recognition

            // Happy bounce on recognition!
            withAnimation(.spring(response: 0.25, dampingFraction: 0.5)) {
                characterScaleY = 1.05
                characterScaleX = 0.97
                characterOffset = -8
            }

            // Eyes center and light up
            withAnimation(.spring(response: 0.3, dampingFraction: 0.6)) {
                lookDirection = .zero
                sparkleIntensity = 1.0
                glowIntensity = 1.0
                eyeTilt = 0.15  // Slight happy tilt
            }

            // Settle back
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                    characterScaleY = 1.0
                    characterScaleX = 1.0
                    characterOffset = 0
                }
            }

            // Recognition blink
            performBlink()

            // Warm glow pulse
            startGlowPulse()
        }

        // Phase 9: Initials appear (3500-3800ms)
        DispatchQueue.main.asyncAfter(deadline: .now() + 3.5) {
            phase = .identity

            withAnimation(.spring(response: 0.4, dampingFraction: 0.7)) {
                initialsOpacity = 1.0
                initialsScale = 1.0
            }
        }

        // Phase 10: Greeting appears (3800-4200ms)
        DispatchQueue.main.asyncAfter(deadline: .now() + 3.8) {
            phase = .greeting

            withAnimation(.easeOut(duration: 0.4)) {
                greetingOpacity = 1.0
                greetingOffset = 0
            }

            withAnimation(.easeOut(duration: 0.4).delay(0.15)) {
                subtitleOpacity = 1.0
            }
        }

        // Phase 11: Complete (4500ms+)
        DispatchQueue.main.asyncAfter(deadline: .now() + 4.5) {
            phase = .complete

            // Gentle farewell blink
            performBlink()

            DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) {
                onComplete?()
            }
        }
    }

    // MARK: - Luxo Jr. Hop Animation

    /// Performs a single Luxo Jr. style hop with squash/stretch
    /// - Parameters:
    ///   - hopNumber: Which hop (1, 2, 3) - affects intensity
    ///   - height: How high to bounce (negative = up)
    ///   - duration: Total hop duration
    private func performLuxoHop(hopNumber: Int, height: CGFloat, duration: Double) {
        bounceCount = hopNumber

        // Calculate squash/stretch intensity (decreases with each hop)
        let intensity = max(0.3, 1.0 - Double(hopNumber - 1) * 0.3)

        // Part 1: ANTICIPATION - Squash down before jump (Pixar principle!)
        withAnimation(.easeIn(duration: duration * 0.15)) {
            characterScaleX = 1.0 + 0.12 * intensity  // Wider
            characterScaleY = 1.0 - 0.15 * intensity  // Shorter
            characterRotation = hopNumber == 1 ? -3 : 0  // Slight lean back on first hop
        }

        // Part 2: LAUNCH - Stretch up as we leave "ground"
        DispatchQueue.main.asyncAfter(deadline: .now() + duration * 0.15) {
            withAnimation(.easeOut(duration: duration * 0.25)) {
                characterOffset = height
                characterScaleX = 1.0 - 0.08 * intensity  // Narrower
                characterScaleY = 1.0 + 0.12 * intensity  // Taller (stretched)
                characterRotation = hopNumber == 1 ? 2 : 0
            }
        }

        // Part 3: PEAK - Normalize at top of arc
        DispatchQueue.main.asyncAfter(deadline: .now() + duration * 0.45) {
            withAnimation(.easeInOut(duration: duration * 0.1)) {
                characterScaleX = 1.0
                characterScaleY = 1.0
                characterRotation = 0
            }
        }

        // Part 4: FALL - Stretch down slightly as we fall
        DispatchQueue.main.asyncAfter(deadline: .now() + duration * 0.55) {
            let landingOffset = hopNumber < 3 ? height * 0.2 : 0
            withAnimation(.easeIn(duration: duration * 0.25)) {
                characterOffset = landingOffset
                characterScaleY = 1.0 + 0.06 * intensity
                characterScaleX = 1.0 - 0.04 * intensity
            }
        }

        // Part 5: IMPACT - Squash on landing
        DispatchQueue.main.asyncAfter(deadline: .now() + duration * 0.8) {
            withAnimation(.spring(response: 0.12, dampingFraction: 0.4)) {
                characterScaleX = 1.0 + 0.08 * intensity
                characterScaleY = 1.0 - 0.1 * intensity
                glowIntensity = min(1.0, glowIntensity + 0.2)  // Glow brightens with each hop
            }
        }

        // Part 6: SETTLE - Return to normal (with slight overshoot)
        DispatchQueue.main.asyncAfter(deadline: .now() + duration * 0.9) {
            withAnimation(.spring(response: 0.2, dampingFraction: 0.6)) {
                characterScaleX = 1.0
                characterScaleY = 1.0
            }
        }
    }

    private func startCuriousLooking() {
        // Look right (curious)
        withAnimation(.spring(response: 0.35, dampingFraction: 0.6)) {
            lookDirection = CGPoint(x: 0.8, y: -0.3)
            eyeTilt = 0.4
        }

        // Look left
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
            withAnimation(.spring(response: 0.35, dampingFraction: 0.6)) {
                lookDirection = CGPoint(x: -0.7, y: 0.1)
                eyeTilt = -0.3
            }
        }

        // Begin sparkle as eyes "find" user
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) {
            withAnimation(.easeOut(duration: 0.3)) {
                sparkleIntensity = 0.5
            }
        }
    }

    private func performBlink() {
        // Quick close
        withAnimation(.easeIn(duration: 0.06)) {
            eyeOpenness = 0.1
        }

        // Slower open
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.08) {
            withAnimation(.easeOut(duration: 0.12)) {
                eyeOpenness = 1.0
            }
        }
    }

    private func startGlowPulse() {
        // Gentle pulsing glow
        withAnimation(
            .easeInOut(duration: 1.5)
            .repeatForever(autoreverses: true)
        ) {
            glowPulse = 1.0
        }
    }
}

// MARK: - Magic Particle

private struct MagicParticle: View {
    let index: Int
    let personaColor: Color
    let screenSize: CGSize
    var startVisible: Bool = false  // NEW: Start visible immediately

    @State private var position: CGPoint = .zero
    @State private var opacity: Double = 0
    @State private var scale: CGFloat = 0.5
    @State private var initialized: Bool = false

    var body: some View {
        Circle()
            .fill(
                RadialGradient(
                    colors: [
                        Color.white.opacity(0.8),
                        personaColor.opacity(0.3),
                        Color.clear
                    ],
                    center: .center,
                    startRadius: 0,
                    endRadius: 4
                )
            )
            .frame(width: 8, height: 8)
            .scaleEffect(scale)
            .opacity(opacity)
            .position(position)
            .onAppear {
                guard !initialized else { return }
                initialized = true

                // Random starting position around center
                let centerX = screenSize.width / 2
                let centerY = screenSize.height / 2 - 80
                let radius = CGFloat.random(in: 80...200)
                let angle = CGFloat.random(in: 0...(2 * .pi))

                position = CGPoint(
                    x: centerX + cos(angle) * radius,
                    y: centerY + sin(angle) * radius
                )

                if startVisible {
                    // Start visible immediately with a small delay for stagger effect
                    opacity = Double.random(in: 0.2...0.5)
                    scale = CGFloat.random(in: 0.5...0.9)

                    // Very short stagger for instant feel
                    let delay = Double(index) * 0.03

                    DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
                        startFloating()
                    }
                } else {
                    // Original delayed behavior
                    let delay = Double(index) * 0.15

                    DispatchQueue.main.asyncAfter(deadline: .now() + delay + 0.5) {
                        startFloating()
                    }
                }
            }
    }

    private func startFloating() {
        // Fade in (or adjust if already visible)
        withAnimation(.easeIn(duration: 0.5)) {
            opacity = Double.random(in: 0.3...0.7)
            scale = CGFloat.random(in: 0.6...1.2)
        }

        // Gentle floating motion
        let duration = Double.random(in: 3...5)
        withAnimation(
            .easeInOut(duration: duration)
            .repeatForever(autoreverses: true)
        ) {
            position.y -= CGFloat.random(in: 20...40)
            position.x += CGFloat.random(in: -15...15)
        }
    }
}

// MARK: - Splash Phase

private enum SplashPhase {
    case initial
    case peek           // Eye peeking from corner (NEW!)
    case anticipation   // Glow building before bounce
    case bounceEntrance // Luxo Jr. hop-hop-hop!
    case awakening      // Eyes slowly open
    case discovery      // Looking around curiously
    case recognition    // "Oh, it's you!" moment
    case identity       // Initials appear
    case greeting       // Welcome message
    case complete       // Ready to transition
}

// MARK: - Twinkling Star

private struct TwinklingStar: View {
    let index: Int
    let screenSize: CGSize
    let personaColor: Color

    @State private var opacity: Double = 0
    @State private var scale: CGFloat = 0.5
    @State private var position: CGPoint = .zero

    var body: some View {
        Circle()
            .fill(
                RadialGradient(
                    colors: [
                        Color.white,
                        Color.white.opacity(0.5),
                        Color.clear
                    ],
                    center: .center,
                    startRadius: 0,
                    endRadius: 3
                )
            )
            .frame(width: 6, height: 6)
            .scaleEffect(scale)
            .opacity(opacity)
            .position(position)
            .onAppear {
                // Distribute stars across the screen
                let margin: CGFloat = 40
                position = CGPoint(
                    x: CGFloat.random(in: margin...(screenSize.width - margin)),
                    y: CGFloat.random(in: margin...(screenSize.height * 0.6))
                )

                // Stagger the twinkle animation start
                let delay = Double.random(in: 0...0.5)

                DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
                    startTwinkling()
                }
            }
    }

    private func startTwinkling() {
        // Initial fade in
        withAnimation(.easeIn(duration: 0.3)) {
            opacity = Double.random(in: 0.3...0.8)
            scale = CGFloat.random(in: 0.6...1.2)
        }

        // Continuous twinkling
        let duration = Double.random(in: 1.5...3.0)
        withAnimation(
            .easeInOut(duration: duration)
            .repeatForever(autoreverses: true)
        ) {
            opacity = Double.random(in: 0.1...0.6)
            scale = CGFloat.random(in: 0.4...1.0)
        }
    }
}

// MARK: - Preview

#if DEBUG
struct MagicalSplashView_Previews: PreviewProvider {
    static var previews: some View {
        Group {
            MagicalSplashView(
                onComplete: { print("Complete!") },
                isReturningUser: false
            )
            .previewDisplayName("New User")

            MagicalSplashView(
                onComplete: { print("Complete!") },
                isReturningUser: true,
                userName: "Sarah"
            )
            .previewDisplayName("Returning User")
        }
    }
}
#endif
