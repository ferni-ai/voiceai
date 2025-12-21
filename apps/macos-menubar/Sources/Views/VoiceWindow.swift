import SwiftUI
import AppKit

// MARK: - Voice Window View

/// Main floating window showing the active voice session.
///
/// **CRITICAL: Minimal observation to prevent flicker.**
///
/// This view observes VoiceManager but uses EquatableView wrappers
/// to prevent child components from being reconstructed on every
/// state/audioLevel change.
struct VoiceWindowView: View {
    @ObservedObject var voiceManager: VoiceManager
    @State private var isHoveringEnd = false

    var body: some View {
        ZStack {
            // Dark background - static, never changes
            RoundedRectangle(cornerRadius: 24)
                .fill(Color(hex: 0x1a1612))

            // Aurora edge - uses EquatableView to prevent reconstruction
            EquatableView(content: StableAuroraEdge(
                personaId: voiceManager.currentPersonaId,
                isActive: voiceManager.state.isActive,
                cornerRadius: 24
            ))

            VStack(spacing: 12) {
                // PixarVoiceOrb - Full Pixar animation with halo, breathing, soul effects
                // Uses EquatableView to prevent parent re-renders from destroying animation
                EquatableView(content: StablePixarVoiceOrb(
                    personaId: voiceManager.currentPersonaId,
                    isActive: voiceManager.state.isActive,
                    size: 70,
                    emotionHint: nil  // Can be wired to emotion detection later
                ))
                .frame(height: 180)

                // Status indicator - this CAN change on state, but it's just text
                statusIndicator
                    .frame(height: 20)

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
                endButton
            }
            .padding(24)
        }
        .frame(width: 220, height: 320)
    }

    // MARK: - Status Indicator

    @ViewBuilder
    private var statusIndicator: some View {
        if voiceManager.isHandoffInProgress, let target = voiceManager.handoffTargetPersona {
            HStack(spacing: 4) {
                Image(systemName: "arrow.right.circle.fill")
                    .foregroundColor(PersonaRegistry.get(target).primaryColor)
                Text("Switching to \(PersonaRegistry.get(target).name)...")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(.white.opacity(0.9))
            }
        } else {
            // Use state title for visual feedback, but this doesn't affect animations
            Text(voiceManager.state.isActive ? "Active" : voiceManager.state.title)
                .font(.system(size: 14, weight: .semibold))
                .foregroundColor(.white)
        }
    }

    // MARK: - End Button

    private var endButton: some View {
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

    // MARK: - Status Subtitle

    private var statusSubtitle: String {
        switch voiceManager.state {
        case .connecting:
            if !voiceManager.connectionProgress.isEmpty {
                return voiceManager.connectionProgress
            }
            return "Connecting..."
        case .connected, .listening, .speaking, .thinking:
            return "In conversation"
        case .disconnected:
            return "Tap to connect"
        case .error(let msg):
            if voiceManager.retryCount > 0 {
                return "\(msg) (retry \(voiceManager.retryCount)/3)"
            }
            return msg
        }
    }
}

// MARK: - Stable Aurora Edge (Equatable Wrapper)

/// Wraps AuroraEdge to prevent parent re-renders from causing reconstruction.
struct StableAuroraEdge: View, Equatable {
    let personaId: String
    let isActive: Bool
    let cornerRadius: CGFloat

    var body: some View {
        AuroraEdge(
            persona: PersonaRegistry.get(personaId),
            isActive: isActive,
            cornerRadius: cornerRadius
        )
    }

    static func == (lhs: StableAuroraEdge, rhs: StableAuroraEdge) -> Bool {
        lhs.personaId == rhs.personaId &&
        lhs.isActive == rhs.isActive &&
        lhs.cornerRadius == rhs.cornerRadius
    }
}

// MARK: - Voice Window Controller

class VoiceWindowController: NSWindowController {
    private let voiceManager: VoiceManager

    init(voiceManager: VoiceManager) {
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
        // Only animate if window is not already visible
        let isNewShow = window?.alphaValue == 0 || !window!.isVisible

        if isNewShow {
            window?.alphaValue = 0
        }

        showWindow(nil)

        if isNewShow {
            NSAnimationContext.runAnimationGroup { context in
                context.duration = 0.2
                window?.animator().alphaValue = 1
            }
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
    let manager = VoiceManager()
    return VoiceWindowView(voiceManager: manager)
        .frame(width: 220, height: 320)
}
