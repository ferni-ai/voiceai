import SwiftUI
import AppKit

// MARK: - Voice Window View

/// Main floating window showing the active voice session
struct VoiceWindowView: View {
    @ObservedObject var voiceManager: VoiceSessionManager
    @State private var isHoveringEnd = false
    
    var body: some View {
        ZStack {
            // Aurora background with rotating gradient edges
            AuroraBackground(
                persona: voiceManager.currentPersona,
                isActive: voiceManager.state.isActive
            )
            .clipShape(RoundedRectangle(cornerRadius: 24))
            
            // Aurora edge animation (like Gemini)
            AuroraEdge(
                persona: voiceManager.currentPersona,
                isActive: voiceManager.state.isActive,
                cornerRadius: 24
            )
            
            VStack(spacing: 16) {
                // Avatar with full Pixar animation suite
                PixarAvatar(
                    persona: voiceManager.currentPersona,
                    voiceState: voiceManager.state,
                    size: 80
                )
                .frame(height: 140)
                
                // Status text
                VStack(spacing: 4) {
                    HStack(spacing: 6) {
                        Text(voiceManager.state.title)
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundColor(.white)
                        
                        // Claude Code indicator
                        if voiceManager.isClaudeCodeActive {
                            HStack(spacing: 4) {
                                Circle()
                                    .fill(Color(hex: 0xda7756))  // Claude orange
                                    .frame(width: 6, height: 6)
                                Text("Claude")
                                    .font(.system(size: 10, weight: .medium))
                                    .foregroundColor(Color(hex: 0xda7756))
                            }
                            .padding(.horizontal, 8)
                            .padding(.vertical, 3)
                            .background(
                                Capsule()
                                    .fill(Color(hex: 0xda7756).opacity(0.2))
                            )
                        }
                    }
                    
                    Text(statusSubtitle)
                        .font(.system(size: 12))
                        .foregroundColor(.white.opacity(0.6))
                }
                
                // Waveform bars (when connected)
                if voiceManager.state.showWaveform {
                    WaveformView(
                        persona: voiceManager.currentPersona,
                        isActive: true,
                        barCount: 8
                    )
                    .frame(height: 24)
                    .transition(.opacity.combined(with: .scale(scale: 0.8)))
                }
                
                // End button
                Button(action: {
                    withAnimation(.spring(response: 0.3)) {
                        voiceManager.stop()
                    }
                }) {
                    HStack(spacing: 6) {
                        Image(systemName: "phone.down.fill")
                            .font(.system(size: 11))
                        Text("End")
                            .font(.system(size: 12, weight: .medium))
                    }
                    .foregroundColor(.white)
                    .padding(.horizontal, 24)
                    .padding(.vertical, 10)
                    .background(
                        Capsule()
                            .fill(isHoveringEnd ? Color.red : Color.red.opacity(0.7))
                    )
                }
                .buttonStyle(.plain)
                .onHover { hovering in
                    withAnimation(.easeInOut(duration: 0.15)) {
                        isHoveringEnd = hovering
                    }
                }
            }
            .padding(24)
        }
        .frame(width: 220, height: 320)
    }
    
    private var statusSubtitle: String {
        switch voiceManager.state {
        case .connecting:
            return "Setting up \(voiceManager.currentPersona.name)"
        case .connected:
            return "\(voiceManager.currentPersona.name) is here"
        case .listening:
            return "Listening to you"
        case .speaking:
            return "\(voiceManager.currentPersona.name) is speaking"
        case .thinking:
            return "Thinking..."
        case .disconnected:
            return "Click menubar to restart"
        case .error(let msg):
            return msg
        }
    }
}

// MARK: - Voice Window Controller

class VoiceWindowController: NSWindowController {
    private let voiceManager: VoiceSessionManager
    
    init(voiceManager: VoiceSessionManager) {
        self.voiceManager = voiceManager
        
        let hostingController = NSHostingController(
            rootView: VoiceWindowView(voiceManager: voiceManager)
        )
        
        let window = NSPanel(
            contentRect: NSRect(x: 0, y: 0, width: 220, height: 320),
            styleMask: [.nonactivatingPanel, .fullSizeContentView, .borderless],
            backing: .buffered,
            defer: false
        )
        
        window.contentViewController = hostingController
        window.isOpaque = false
        window.backgroundColor = .clear
        window.hasShadow = true
        window.level = .floating
        window.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        window.isMovableByWindowBackground = true
        window.animationBehavior = .utilityWindow
        
        // Position near top-right
        if let screen = NSScreen.main {
            let screenRect = screen.visibleFrame
            let windowX = screenRect.maxX - 220
            let windowY = screenRect.maxY - 300
            window.setFrameOrigin(NSPoint(x: windowX, y: windowY))
        }
        
        super.init(window: window)
    }
    
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }
    
    func showWithAnimation() {
        window?.alphaValue = 0
        showWindow(nil)
        NSAnimationContext.runAnimationGroup { context in
            context.duration = 0.2
            window?.animator().alphaValue = 1
        }
    }
    
    func closeWithAnimation() {
        NSAnimationContext.runAnimationGroup({ context in
            context.duration = 0.15
            window?.animator().alphaValue = 0
        }, completionHandler: {
            self.close()
        })
    }
}

// MARK: - Preview

#Preview {
    let manager = VoiceSessionManager()
    return VoiceWindowView(voiceManager: manager)
        .frame(width: 220, height: 320)
}

