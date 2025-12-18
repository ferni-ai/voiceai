import SwiftUI
import AppKit

// MARK: - Voice Window View

/// Main floating window showing the active voice session
struct VoiceWindowView: View {
    @ObservedObject var voiceManager: DualModeVoiceManager
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
            
            VStack(spacing: 12) {
                // Full avatar composite with text initials, halo, and waveform
                FullAvatarComposite(
                    persona: voiceManager.currentPersona,
                    voiceState: voiceManager.state,
                    size: 70,
                    showName: false,  // We show name separately below
                    showWaveform: true
                )
                .frame(height: 160)
                
                // Status with Claude indicator and handoff state
                HStack(spacing: 6) {
                    if voiceManager.isHandoffInProgress, let target = voiceManager.handoffTargetPersona {
                        // Handoff in progress indicator
                        HStack(spacing: 4) {
                            Image(systemName: "arrow.right.circle.fill")
                                .foregroundColor(PersonaRegistry.get(target).primaryColor)
                            Text("Switching to \(PersonaRegistry.get(target).name)...")
                                .font(.system(size: 13, weight: .medium))
                                .foregroundColor(.white.opacity(0.9))
                        }
                    } else {
                        Text(voiceManager.state.title)
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundColor(.white)
                    }
                    
                    // Claude Code indicator (CLI mode only)
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
                
                // Persona name and subtitle
                VStack(spacing: 2) {
                    Text(voiceManager.currentPersona.name)
                        .font(.system(size: 15, weight: .semibold, design: .rounded))
                        .foregroundColor(.white)
                    
                    Text(statusSubtitle)
                        .font(.system(size: 11))
                        .foregroundColor(.white.opacity(0.6))
                }
                
                // End button
                Button(action: {
                    Task {
                        await voiceManager.stop()
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
            // Show detailed progress if available
            if !voiceManager.connectionProgress.isEmpty {
                return voiceManager.connectionProgress
            }
            return "Connecting..."
        case .connected:
            return "Ready to chat"
        case .listening:
            return "Listening..."
        case .speaking:
            return "Speaking..."
        case .thinking:
            return "Thinking..."
        case .disconnected:
            return "Tap to connect"
        case .error(let msg):
            // Show retry count if retrying
            if voiceManager.retryCount > 0 {
                return "\(msg) (retry \(voiceManager.retryCount)/3)"
            }
            return msg
        }
    }
}

// MARK: - Voice Window Controller

class VoiceWindowController: NSWindowController {
    private let voiceManager: DualModeVoiceManager
    
    init(voiceManager: DualModeVoiceManager) {
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
    let manager = DualModeVoiceManager()
    return VoiceWindowView(voiceManager: manager)
        .frame(width: 220, height: 320)
}

