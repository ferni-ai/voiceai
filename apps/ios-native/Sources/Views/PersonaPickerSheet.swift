import SwiftUI
import FerniShared

#if os(iOS)
import UIKit
#endif

// MARK: - Persona Picker Sheet
/// Bottom sheet for selecting which persona to talk to.
/// Shows all 6 personas with their colors and descriptions.

struct PersonaPickerSheet: View {
    @EnvironmentObject var session: IOSLiveKitSession
    @EnvironmentObject var appState: AppState

    // Animation
    @State private var offset: CGFloat = 1000  // Large initial offset, will animate in

    var body: some View {
        ZStack(alignment: .bottom) {
            // Dimmed background
            Color.black.opacity(0.5)
                .ignoresSafeArea()
                .onTapGesture {
                    dismiss()
                }

            // Sheet content
            VStack(spacing: 0) {
                // Handle bar
                RoundedRectangle(cornerRadius: 2.5)
                    .fill(Color.white.opacity(0.3))
                    .frame(width: 40, height: 5)
                    .padding(.top, 12)
                    .padding(.bottom, 20)

                // Title
                Text("Choose Your Guide")
                    .font(.system(size: 20, weight: .semibold, design: .rounded))
                    .foregroundColor(.white)
                    .padding(.bottom, 20)

                // Persona grid
                LazyVGrid(columns: [
                    GridItem(.flexible()),
                    GridItem(.flexible())
                ], spacing: 16) {
                    ForEach(PersonaRegistry.all, id: \.id) { persona in
                        PersonaCard(
                            persona: persona,
                            isSelected: session.currentPersonaId == persona.id,
                            action: {
                                selectPersona(persona.id)
                            }
                        )
                    }
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 30)
            }
            .frame(maxWidth: .infinity)
            .background(
                RoundedRectangle(cornerRadius: 24)
                    .fill(Color(white: 0.12))
                    .ignoresSafeArea(edges: .bottom)
            )
            .offset(y: offset)
        }
        .onAppear {
            withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
                offset = 0
            }
        }
    }

    private func selectPersona(_ personaId: String) {
        appState.playTapHaptic()

        Task {
            await session.switchPersona(personaId)
        }

        dismiss()
    }

    private func dismiss() {
        withAnimation(.spring(response: 0.3, dampingFraction: 0.9)) {
            offset = 1000
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
            appState.showPersonaPicker = false
        }
    }
}

// MARK: - Persona Card

struct PersonaCard: View {
    let persona: Persona
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 12) {
                // Avatar circle with initials
                ZStack {
                    Circle()
                        .fill(
                            LinearGradient(
                                colors: [persona.primaryColor, persona.secondaryColor],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                        .frame(width: 60, height: 60)

                    Text(persona.initials)
                        .font(.system(size: 22, weight: .semibold, design: .rounded))
                        .foregroundColor(.white)
                }

                // Name
                Text(persona.name)
                    .font(.system(size: 15, weight: .semibold, design: .rounded))
                    .foregroundColor(.white)

                // Role
                Text(persona.role)
                    .font(.system(size: 12, weight: .regular, design: .rounded))
                    .foregroundColor(.white.opacity(0.6))
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 16)
            .background(
                RoundedRectangle(cornerRadius: 16)
                    .fill(Color.white.opacity(isSelected ? 0.15 : 0.05))
                    .overlay(
                        RoundedRectangle(cornerRadius: 16)
                            .stroke(
                                isSelected ? persona.primaryColor : Color.clear,
                                lineWidth: 2
                            )
                    )
            )
        }
    }
}

// MARK: - Preview

#Preview {
    ZStack {
        Color.black.ignoresSafeArea()
        PersonaPickerSheet()
            .environmentObject(IOSLiveKitSession())
            .environmentObject(AppState())
    }
}
