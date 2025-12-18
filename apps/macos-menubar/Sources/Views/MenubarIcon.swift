import SwiftUI
import AppKit

// MARK: - Custom Menubar Icon

/// Custom Ferni logo for the menubar - the "thinking stone" eye
/// Matches the web app's ferni-logo.ui.ts design
struct MenubarIconView: View {
    let persona: Persona
    let state: VoiceState
    let size: CGFloat
    
    @State private var breatheScale: CGFloat = 1.0
    @State private var glowOpacity: Double = 0.0
    
    var body: some View {
        ZStack {
            // Background stone (circle)
            Circle()
                .fill(
                    RadialGradient(
                        colors: [
                            persona.primaryColor,
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
                .fill(Color.white)
                .frame(width: size * 0.4, height: size * 0.4)
            
            // Iris
            Circle()
                .fill(persona.primaryColor)
                .frame(width: size * 0.28, height: size * 0.28)
            
            // Pupil
            Circle()
                .fill(Color(hex: 0x1a1612))
                .frame(width: size * 0.14, height: size * 0.14)
            
            // Catchlight (eye reflection)
            Circle()
                .fill(Color.white.opacity(0.9))
                .frame(width: size * 0.06, height: size * 0.06)
                .offset(x: -size * 0.04, y: -size * 0.04)
            
            // Active state glow ring
            if state.isActive {
                Circle()
                    .stroke(persona.primaryColor.opacity(glowOpacity), lineWidth: 1.5)
                    .frame(width: size + 4, height: size + 4)
            }
        }
        .scaleEffect(breatheScale)
        .onAppear {
            if state.isActive {
                startAnimations()
            }
        }
        .onChange(of: state) { newState in
            if newState.isActive {
                startAnimations()
            } else {
                stopAnimations()
            }
        }
    }
    
    private func startAnimations() {
        // Subtle breathing
        withAnimation(
            .easeInOut(duration: 3.0)
            .repeatForever(autoreverses: true)
        ) {
            breatheScale = 1.02
        }
        
        // Glow pulse
        withAnimation(
            .easeInOut(duration: 1.5)
            .repeatForever(autoreverses: true)
        ) {
            glowOpacity = 0.6
        }
    }
    
    private func stopAnimations() {
        withAnimation(.easeOut(duration: 0.3)) {
            breatheScale = 1.0
            glowOpacity = 0.0
        }
    }
}

// MARK: - NSImage Generator

/// Generates NSImage for use in NSStatusItem button
@MainActor
class MenubarIconGenerator {
    
    /// Generate a menubar icon NSImage
    static func generateIcon(
        persona: Persona,
        state: VoiceState,
        size: CGFloat = 18
    ) -> NSImage {
        // Create the SwiftUI view
        let view = MenubarIconView(persona: persona, state: state, size: size)
        
        // Render to NSImage
        let renderer = ImageRenderer(content: view)
        renderer.scale = 2.0  // Retina
        
        if let cgImage = renderer.cgImage {
            let nsImage = NSImage(cgImage: cgImage, size: NSSize(width: size, height: size))
            nsImage.isTemplate = !state.isActive  // Template mode when inactive for auto dark/light
            return nsImage
        }
        
        // Fallback to SF Symbol
        return NSImage(systemSymbolName: "mic.circle", accessibilityDescription: "Ferni Voice")!
    }
    
    /// Generate animated icon frames for speaking state
    static func generateSpeakingFrames(
        persona: Persona,
        frameCount: Int = 4,
        size: CGFloat = 18
    ) -> [NSImage] {
        var frames: [NSImage] = []
        
        for i in 0..<frameCount {
            let phase = Double(i) / Double(frameCount) * .pi * 2
            let scale = 1.0 + sin(phase) * 0.05
            
            let view = MenubarIconView(persona: persona, state: .speaking, size: size)
                .scaleEffect(scale)
            
            let renderer = ImageRenderer(content: view)
            renderer.scale = 2.0
            
            if let cgImage = renderer.cgImage {
                let nsImage = NSImage(cgImage: cgImage, size: NSSize(width: size, height: size))
                frames.append(nsImage)
            }
        }
        
        return frames
    }
}

// MARK: - Simple Eye Icon (for minimal size)

/// Ultra-simple Ferni eye for very small sizes
struct SimpleEyeIcon: View {
    let color: Color
    let size: CGFloat
    
    var body: some View {
        ZStack {
            // Stone
            Circle()
                .fill(color)
                .frame(width: size, height: size)
            
            // Eye
            Circle()
                .fill(Color.white)
                .frame(width: size * 0.45, height: size * 0.45)
            
            // Pupil
            Circle()
                .fill(Color.black)
                .frame(width: size * 0.2, height: size * 0.2)
        }
    }
}

// MARK: - State-Based Icon Variants

extension MenubarIconGenerator {
    
    /// Get appropriate SF Symbol for state (fallback)
    nonisolated static func sfSymbol(for state: VoiceState) -> String {
        switch state {
        case .disconnected:
            return "mic.circle"
        case .connecting:
            return "mic.circle.fill"
        case .connected:
            return "waveform.circle.fill"
        case .listening:
            return "ear.fill"
        case .speaking:
            return "waveform"
        case .thinking:
            return "ellipsis.circle.fill"
        case .error:
            return "exclamationmark.circle"
        }
    }
    
    /// Create status item button with custom icon
    static func configureButton(
        _ button: NSStatusBarButton,
        persona: Persona,
        state: VoiceState,
        useCustomIcon: Bool = true
    ) {
        if useCustomIcon {
            button.image = generateIcon(persona: persona, state: state)
        } else {
            // Fallback to SF Symbol
            let symbolName = sfSymbol(for: state)
            button.image = NSImage(systemSymbolName: symbolName, accessibilityDescription: "Ferni Voice")
            button.image?.isTemplate = !state.isActive
            
            // Tint when active
            if state.isActive {
                button.contentTintColor = NSColor(persona.primaryColor)
            } else {
                button.contentTintColor = nil
            }
        }
    }
}

// MARK: - Preview

#Preview("Menubar Icons") {
    HStack(spacing: 20) {
        VStack {
            MenubarIconView(persona: PersonaRegistry.ferni, state: .disconnected, size: 18)
            Text("Idle")
        }
        VStack {
            MenubarIconView(persona: PersonaRegistry.ferni, state: .connected, size: 18)
            Text("Connected")
        }
        VStack {
            MenubarIconView(persona: PersonaRegistry.maya, state: .speaking, size: 18)
            Text("Speaking")
        }
        VStack {
            MenubarIconView(persona: PersonaRegistry.alex, state: .listening, size: 18)
            Text("Listening")
        }
    }
    .padding(20)
    .background(Color.gray)
}

#Preview("Large Icons") {
    HStack(spacing: 30) {
        ForEach(PersonaRegistry.all.prefix(3)) { persona in
            MenubarIconView(persona: persona, state: .connected, size: 40)
        }
    }
    .padding(30)
    .background(Color(hex: 0x2c2520))
}

