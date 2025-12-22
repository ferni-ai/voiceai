import SwiftUI
import AVFoundation

// MARK: - Onboarding View
/// First-launch experience that introduces Ferni and requests microphone permission.

struct OnboardingView: View {
    @Binding var isComplete: Bool
    @State private var currentPage = 0
    @State private var micPermissionGranted = false

    var body: some View {
        ZStack {
            // Background
            Color.black.ignoresSafeArea()

            VStack(spacing: 0) {
                // Page content
                TabView(selection: $currentPage) {
                    welcomePage.tag(0)
                    microphonePage.tag(1)
                    readyPage.tag(2)
                }
                .tabViewStyle(.page(indexDisplayMode: .never))

                // Page indicator
                HStack(spacing: 8) {
                    ForEach(0..<3) { index in
                        Circle()
                            .fill(currentPage == index ? Color.white : Color.white.opacity(0.3))
                            .frame(width: 8, height: 8)
                    }
                }
                .padding(.bottom, 30)

                // Next/Continue button
                Button(action: handleNextTap) {
                    Text(buttonTitle)
                        .font(.system(size: 17, weight: .semibold, design: .rounded))
                        .foregroundColor(.black)
                        .frame(maxWidth: .infinity)
                        .frame(height: 54)
                        .background(
                            RoundedRectangle(cornerRadius: 14)
                                .fill(Color.white)
                        )
                }
                .padding(.horizontal, 24)
                .padding(.bottom, 50)
            }
        }
    }

    // MARK: - Pages

    private var welcomePage: some View {
        VStack(spacing: 24) {
            Spacer()

            // Ferni icon (3 stone)
            ZStack {
                Circle()
                    .fill(Color(hex: "4a6741"))
                    .frame(width: 120, height: 120)

                Circle()
                    .fill(Color.white)
                    .frame(width: 48, height: 48)

                Circle()
                    .fill(Color(hex: "5a8060"))
                    .frame(width: 32, height: 32)

                Circle()
                    .fill(Color(hex: "2c2520"))
                    .frame(width: 16, height: 16)

                Circle()
                    .fill(Color.white.opacity(0.9))
                    .frame(width: 5, height: 5)
                    .offset(x: -4, y: -4)
            }

            VStack(spacing: 12) {
                Text("Meet Ferni")
                    .font(.system(size: 32, weight: .bold, design: .rounded))
                    .foregroundColor(.white)

                Text("Your AI life coach and team coordinator.\nHave natural voice conversations anytime.")
                    .font(.system(size: 17, weight: .regular, design: .rounded))
                    .foregroundColor(.white.opacity(0.7))
                    .multilineTextAlignment(.center)
                    .lineSpacing(4)
            }
            .padding(.horizontal, 40)

            Spacer()
            Spacer()
        }
    }

    private var microphonePage: some View {
        VStack(spacing: 24) {
            Spacer()

            // Microphone icon
            ZStack {
                Circle()
                    .fill(Color(hex: "4a6741").opacity(0.2))
                    .frame(width: 120, height: 120)

                Image(systemName: "mic.fill")
                    .font(.system(size: 48, weight: .medium))
                    .foregroundColor(Color(hex: "4a6741"))
            }

            VStack(spacing: 12) {
                Text("Voice Access")
                    .font(.system(size: 32, weight: .bold, design: .rounded))
                    .foregroundColor(.white)

                Text("Ferni needs microphone access to hear you.\nYour conversations stay private.")
                    .font(.system(size: 17, weight: .regular, design: .rounded))
                    .foregroundColor(.white.opacity(0.7))
                    .multilineTextAlignment(.center)
                    .lineSpacing(4)
            }
            .padding(.horizontal, 40)

            if micPermissionGranted {
                HStack(spacing: 8) {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundColor(.green)
                    Text("Microphone enabled")
                        .foregroundColor(.green)
                }
                .font(.system(size: 15, weight: .medium, design: .rounded))
            }

            Spacer()
            Spacer()
        }
    }

    private var readyPage: some View {
        VStack(spacing: 24) {
            Spacer()

            // Ready icon
            ZStack {
                Circle()
                    .fill(Color(hex: "4a6741").opacity(0.2))
                    .frame(width: 120, height: 120)

                Image(systemName: "checkmark")
                    .font(.system(size: 48, weight: .bold))
                    .foregroundColor(Color(hex: "4a6741"))
            }

            VStack(spacing: 12) {
                Text("You're Ready")
                    .font(.system(size: 32, weight: .bold, design: .rounded))
                    .foregroundColor(.white)

                Text("Tap the orb to start a conversation.\nFerni and the team are here for you.")
                    .font(.system(size: 17, weight: .regular, design: .rounded))
                    .foregroundColor(.white.opacity(0.7))
                    .multilineTextAlignment(.center)
                    .lineSpacing(4)
            }
            .padding(.horizontal, 40)

            Spacer()
            Spacer()
        }
    }

    // MARK: - Actions

    private var buttonTitle: String {
        switch currentPage {
        case 0: return "Continue"
        case 1: return micPermissionGranted ? "Continue" : "Enable Microphone"
        case 2: return "Get Started"
        default: return "Continue"
        }
    }

    private func handleNextTap() {
        switch currentPage {
        case 0:
            withAnimation { currentPage = 1 }
        case 1:
            if micPermissionGranted {
                withAnimation { currentPage = 2 }
            } else {
                requestMicrophonePermission()
            }
        case 2:
            completeOnboarding()
        default:
            break
        }
    }

    private func requestMicrophonePermission() {
        AVAudioSession.sharedInstance().requestRecordPermission { granted in
            DispatchQueue.main.async {
                micPermissionGranted = granted
                if granted {
                    withAnimation { currentPage = 2 }
                }
            }
        }
    }

    private func completeOnboarding() {
        UserDefaults.standard.set(true, forKey: "hasCompletedOnboarding")
        withAnimation(.easeInOut(duration: 0.3)) {
            isComplete = true
        }
    }
}

// MARK: - Color Extension

extension Color {
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let r, g, b: UInt64
        (r, g, b) = ((int >> 16) & 0xFF, (int >> 8) & 0xFF, int & 0xFF)
        self.init(
            .sRGB,
            red: Double(r) / 255,
            green: Double(g) / 255,
            blue: Double(b) / 255,
            opacity: 1
        )
    }
}

// MARK: - Preview

#Preview {
    OnboardingView(isComplete: .constant(false))
}
