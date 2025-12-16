import SwiftUI

// MARK: - Pixar Avatar - Complete Animation System

/// Full Pixar-quality avatar combining Lamp body language and Soul emotional effects
struct PixarAvatar: View {
    let persona: Persona
    let voiceState: VoiceState
    let size: CGFloat
    
    @StateObject private var lamp = AvatarLamp()
    @StateObject private var soul = AvatarSoul()
    
    @State private var lastState: VoiceState?
    
    var body: some View {
        ZStack {
            // Soul glow layer (behind avatar)
            SoulGlowView(soul: soul, persona: persona, size: size)
            
            // Animated waveform ring (when active)
            if voiceState.showWaveform {
                WaveformRing(
                    persona: persona,
                    size: size,
                    isActive: voiceState.isActive,
                    segmentCount: 24
                )
                .opacity(0.7)
                .transition(.opacity.combined(with: .scale(scale: 0.9)))
            }
            
            // Main avatar with Lamp animations applied
            FerniEyeAvatarAnimated(
                persona: persona,
                size: size,
                lamp: lamp,
                soul: soul
            )
            .animatedAvatar(lamp.state)
        }
        .frame(width: size * 1.8, height: size * 1.8)
        .onAppear {
            handleStateChange(voiceState)
        }
        .onChange(of: voiceState) { newState in
            handleStateChange(newState)
        }
    }
    
    private func handleStateChange(_ state: VoiceState) {
        guard state != lastState else { return }
        lastState = state
        
        switch state {
        case .connecting:
            lamp.express(.curious)
            soul.dilatePupil(to: .interested)
            
        case .connected:
            lamp.express(.happy)
            soul.playWarmthBloom()
            soul.dilatePupil(to: .connected)
            
        case .listening:
            lamp.express(.listening)
            soul.setGlowMood(.calm)
            soul.dilatePupil(to: .interested)
            
        case .speaking:
            lamp.state.isBreathing = true
            lamp.startBreathing()
            soul.setGlowMood(.warm, bleedAmount: 0.5)
            soul.dilatePupil(to: .neutral)
            
        case .thinking:
            lamp.express(.thinking)
            soul.setGlowMood(.neutral)
            soul.dilatePupil(to: .contracted)
            
        case .disconnected:
            lamp.express(.neutral)
            soul.setGlowMood(.neutral)
            soul.dilatePupil(to: .neutral)
            
        case .error:
            lamp.express(.sad)
            soul.setGlowMood(.concerned)
        }
    }
}

// MARK: - Animated Ferni Eye Avatar

/// Ferni eye with soul effects integrated
struct FerniEyeAvatarAnimated: View {
    let persona: Persona
    let size: CGFloat
    @ObservedObject var lamp: AvatarLamp
    @ObservedObject var soul: AvatarSoul
    
    var body: some View {
        ZStack {
            // Outer stone (persona color)
            Circle()
                .fill(
                    RadialGradient(
                        colors: [
                            persona.primaryColor.opacity(0.95),
                            persona.secondaryColor
                        ],
                        center: .center,
                        startRadius: 0,
                        endRadius: size / 2
                    )
                )
                .frame(width: size, height: size)
            
            // Eye white (sclera)
            Circle()
                .fill(
                    RadialGradient(
                        colors: [
                            Color.white,
                            Color(white: 0.95)
                        ],
                        center: .topLeading,
                        startRadius: 0,
                        endRadius: size * 0.4
                    )
                )
                .frame(width: size * 0.36, height: size * 0.36)
            
            // Iris with shimmer effect
            ZStack {
                Circle()
                    .fill(
                        RadialGradient(
                            colors: [
                                persona.primaryColor.opacity(0.9),
                                persona.primaryColor.opacity(0.7)
                            ],
                            center: .topLeading,
                            startRadius: 0,
                            endRadius: size * 0.15
                        )
                    )
                
                // Shimmer highlight
                Circle()
                    .fill(
                        RadialGradient(
                            colors: [
                                Color.white.opacity(0.3 * soul.state.shimmerIntensity),
                                Color.clear
                            ],
                            center: .topLeading,
                            startRadius: 0,
                            endRadius: size * 0.12
                        )
                    )
            }
            .frame(width: size * 0.24, height: size * 0.24)
            .offset(
                x: soul.state.pupilOffsetX * 2,
                y: soul.state.pupilOffsetY * 2
            )
            
            // Pupil with dilation
            Circle()
                .fill(Color(hex: 0x1a1612))
                .frame(
                    width: size * 0.12 * soul.state.pupilSize,
                    height: size * 0.12 * soul.state.pupilSize
                )
                .offset(
                    x: soul.state.pupilOffsetX * 3,
                    y: soul.state.pupilOffsetY * 3
                )
            
            // Catchlight (eye reflection)
            Circle()
                .fill(Color.white.opacity(0.85))
                .frame(width: size * 0.04, height: size * 0.04)
                .offset(
                    x: -size * 0.03 + soul.state.pupilOffsetX * 2,
                    y: -size * 0.03 + soul.state.pupilOffsetY * 2
                )
        }
    }
}

// MARK: - Demo/Test View

struct PixarAvatarDemo: View {
    @State private var currentEmotion: LampEmotion = .neutral
    @State private var voiceState: VoiceState = .connected
    
    var body: some View {
        VStack(spacing: 30) {
            PixarAvatar(
                persona: PersonaRegistry.ferni,
                voiceState: voiceState,
                size: 120
            )
            
            // Emotion picker
            Text("Emotion:")
                .font(.headline)
            
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 100))], spacing: 10) {
                ForEach(LampEmotion.allCases, id: \.rawValue) { emotion in
                    Button(emotion.rawValue.capitalized) {
                        currentEmotion = emotion
                    }
                    .buttonStyle(.bordered)
                    .tint(currentEmotion == emotion ? .blue : .gray)
                }
            }
            .padding()
            
            // State picker
            Text("Voice State:")
                .font(.headline)
            
            HStack(spacing: 10) {
                Button("Connected") { voiceState = .connected }
                Button("Speaking") { voiceState = .speaking }
                Button("Listening") { voiceState = .listening }
                Button("Thinking") { voiceState = .thinking }
            }
        }
        .padding()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(hex: 0x584840))
    }
}

// MARK: - Preview

#Preview("Pixar Avatar Demo") {
    PixarAvatarDemo()
}

#Preview("All Personas") {
    HStack(spacing: 30) {
        ForEach(PersonaRegistry.all.prefix(3)) { persona in
            PixarAvatar(
                persona: persona,
                voiceState: .connected,
                size: 80
            )
        }
    }
    .padding(40)
    .background(Color(hex: 0x584840))
}

