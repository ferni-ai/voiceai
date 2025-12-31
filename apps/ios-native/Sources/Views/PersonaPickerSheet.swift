import SwiftUI
import FerniShared

#if os(iOS)
import UIKit
#endif

// MARK: - Persona Picker Sheet
/// Beautiful bottom sheet for selecting team members.
/// Shows unlock status, progress, and smooth color transitions.

struct PersonaPickerSheet: View {
    @EnvironmentObject var session: IOSLiveKitSession
    @EnvironmentObject var appState: AppState
    @EnvironmentObject var relationshipService: RelationshipArcService
    @StateObject private var teamUnlockService = TeamUnlockService.shared
    
    // Animation state
    @State private var offset: CGFloat = 1000
    @State private var selectedPersona: Persona?
    @State private var showLockedToast: String? = nil
    
    var body: some View {
        ZStack(alignment: .bottom) {
            // Dimmed background with persona color tint
            backgroundOverlay
                .onTapGesture { dismiss() }
            
            // Sheet content
            VStack(spacing: 0) {
                // Handle bar
                handleBar
                
                // Header with relationship context
                headerSection
                
                // Team grid
                teamGrid
                
                // Bottom spacing for home indicator
                Color.clear.frame(height: 20)
            }
            .frame(maxWidth: .infinity)
            .background(sheetBackground)
            .offset(y: offset)
            
            // Locked toast
            if let toast = showLockedToast {
                lockedToast(message: toast)
            }
        }
        .onAppear {
            withAnimation(.spring(response: 0.4, dampingFraction: 0.85)) {
                offset = 0
            }
        }
    }
    
    // MARK: - Background
    
    private var backgroundOverlay: some View {
        let persona = PersonaRegistry.get(session.currentPersonaId)
        return ZStack {
            Color.black.opacity(0.6)
            
            // Subtle persona color radial at top
            RadialGradient(
                colors: [
                    persona.primaryColor.opacity(0.15),
                    Color.clear
                ],
                center: .top,
                startRadius: 0,
                endRadius: 400
            )
        }
        .ignoresSafeArea()
    }
    
    private var sheetBackground: some View {
        RoundedRectangle(cornerRadius: 28)
            .fill(
                LinearGradient(
                    colors: [
                        Color(white: 0.14),
                        Color(white: 0.10)
                    ],
                    startPoint: .top,
                    endPoint: .bottom
                )
            )
            .overlay(
                RoundedRectangle(cornerRadius: 28)
                    .stroke(Color.white.opacity(0.08), lineWidth: 1)
            )
            .ignoresSafeArea(edges: .bottom)
    }
    
    // MARK: - Header
    
    private var handleBar: some View {
        RoundedRectangle(cornerRadius: 3)
            .fill(Color.white.opacity(0.25))
            .frame(width: 44, height: 5)
            .padding(.top, 14)
            .padding(.bottom, 16)
    }
    
    private var headerSection: some View {
        VStack(spacing: 8) {
            Text("Your Team")
                .font(.system(size: 24, weight: .semibold, design: .rounded))
                .foregroundColor(.white)
            
            // Relationship context
            HStack(spacing: 6) {
                Image(systemName: relationshipService.currentStage.iconName)
                    .font(.system(size: 12, weight: .semibold))
                
                Text(relationshipService.currentStage.title)
                    .font(.system(size: 13, weight: .medium, design: .rounded))
            }
            .foregroundColor(Color(hexString: relationshipService.currentStage.color))
            .padding(.horizontal, 14)
            .padding(.vertical, 6)
            .background(
                Capsule()
                    .fill(Color(hexString: relationshipService.currentStage.color).opacity(0.15))
            )
        }
        .padding(.bottom, 20)
    }
    
    // MARK: - Team Grid
    
    private var teamGrid: some View {
        LazyVGrid(columns: [
            GridItem(.flexible(), spacing: 14),
            GridItem(.flexible(), spacing: 14)
        ], spacing: 14) {
            ForEach(PersonaRegistry.all, id: \.id) { persona in
                let isUnlocked = teamUnlockService.isUnlocked(persona.id)
                let status = teamUnlockService.getStatus(persona.id)
                let isSelected = session.currentPersonaId == persona.id
                
                TeamMemberCard(
                    persona: persona,
                    isSelected: isSelected,
                    isUnlocked: isUnlocked,
                    progress: status.progress,
                    lockReason: status.lockReason,
                    action: {
                        handleCardTap(persona: persona, isUnlocked: isUnlocked, reason: status.unlockHint)
                    }
                )
            }
        }
        .padding(.horizontal, 18)
        .padding(.bottom, 12)
    }
    
    // MARK: - Locked Toast
    
    private func lockedToast(message: String) -> some View {
        VStack {
            Spacer()
            
            HStack(spacing: 10) {
                Image(systemName: "lock.fill")
                    .font(.system(size: 14, weight: .semibold))
                
                Text(message)
                    .font(.system(size: 14, weight: .medium, design: .rounded))
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
            }
            .foregroundColor(.white.opacity(0.9))
            .padding(.horizontal, 20)
            .padding(.vertical, 14)
            .background(
                Capsule()
                    .fill(Color(white: 0.2))
                    .shadow(color: .black.opacity(0.3), radius: 10, y: 4)
            )
            .padding(.bottom, 120)
        }
        .transition(.move(edge: .bottom).combined(with: .opacity))
        .zIndex(10)
    }
    
    // MARK: - Actions
    
    private func handleCardTap(persona: Persona, isUnlocked: Bool, reason: String?) {
        appState.playTapHaptic()
        
        if isUnlocked {
            selectPersona(persona.id)
        } else {
            // Show locked toast
            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                showLockedToast = reason ?? "Keep talking to Ferni to unlock \(persona.name)"
            }
            
            // Hide after delay
            DispatchQueue.main.asyncAfter(deadline: .now() + 2.5) {
                withAnimation(.easeOut(duration: 0.2)) {
                    showLockedToast = nil
                }
            }
        }
    }
    
    private func selectPersona(_ personaId: String) {
        // Haptic feedback
        #if os(iOS)
        let generator = UIImpactFeedbackGenerator(style: .medium)
        generator.impactOccurred()
        #endif
        
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

// MARK: - Team Member Card

struct TeamMemberCard: View {
    let persona: Persona
    let isSelected: Bool
    let isUnlocked: Bool
    let progress: Double
    let lockReason: String?
    let action: () -> Void
    
    @State private var isPressed = false
    
    var body: some View {
        Button(action: action) {
            ZStack {
                // Card background
                cardBackground
                
                // Content
                VStack(spacing: 10) {
                    // Avatar with lock overlay
                    avatarView
                    
                    // Name
                    Text(persona.name)
                        .font(.system(size: 15, weight: .semibold, design: .rounded))
                        .foregroundColor(isUnlocked ? .white : .white.opacity(0.4))
                    
                    // Role
                    Text(persona.role)
                        .font(.system(size: 11, weight: .medium, design: .rounded))
                        .foregroundColor(isUnlocked ? .white.opacity(0.6) : .white.opacity(0.25))
                        .lineLimit(1)
                }
                .padding(.vertical, 18)
            }
            .scaleEffect(isPressed ? 0.95 : 1.0)
        }
        .buttonStyle(PlainButtonStyle())
        .simultaneousGesture(
            DragGesture(minimumDistance: 0)
                .onChanged { _ in
                    withAnimation(.easeOut(duration: 0.08)) { isPressed = true }
                }
                .onEnded { _ in
                    withAnimation(.spring(response: 0.25, dampingFraction: 0.6)) { isPressed = false }
                }
        )
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(persona.name), \(persona.role)")
        .accessibilityValue(isSelected ? "Currently selected" : (isUnlocked ? "Available" : "Locked"))
        .accessibilityHint(isUnlocked ? "Double tap to switch to \(persona.name)" : "Not yet unlocked")
    }
    
    private var cardBackground: some View {
        RoundedRectangle(cornerRadius: 18)
            .fill(
                isSelected
                    ? LinearGradient(
                        colors: [
                            persona.primaryColor.opacity(0.35),
                            persona.secondaryColor.opacity(0.2)
                        ],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                    : LinearGradient(
                        colors: [
                            Color.white.opacity(isUnlocked ? 0.08 : 0.03),
                            Color.white.opacity(isUnlocked ? 0.04 : 0.01)
                        ],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
            )
            .overlay(
                RoundedRectangle(cornerRadius: 18)
                    .stroke(
                        isSelected
                            ? persona.primaryColor.opacity(0.6)
                            : Color.white.opacity(isUnlocked ? 0.1 : 0.03),
                        lineWidth: isSelected ? 2 : 1
                    )
            )
            .shadow(color: isSelected ? persona.glowColor.opacity(0.2) : .clear, radius: 12)
    }
    
    private var avatarView: some View {
        ZStack {
            // Avatar circle
            Circle()
                .fill(
                    LinearGradient(
                        colors: isUnlocked
                            ? [persona.primaryColor, persona.secondaryColor]
                            : [Color.gray.opacity(0.4), Color.gray.opacity(0.2)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .frame(width: 58, height: 58)
                .shadow(color: isUnlocked ? persona.glowColor.opacity(0.3) : .clear, radius: 8)
            
            if isUnlocked {
                // Initials
                Text(persona.initials)
                    .font(.system(size: 20, weight: .semibold, design: .rounded))
                    .foregroundColor(.white)
            } else {
                // Lock icon with progress ring
                ZStack {
                    // Progress ring background
                    Circle()
                        .stroke(Color.white.opacity(0.1), lineWidth: 3)
                        .frame(width: 58, height: 58)
                    
                    // Progress ring
                    Circle()
                        .trim(from: 0, to: progress)
                        .stroke(
                            persona.primaryColor.opacity(0.5),
                            style: StrokeStyle(lineWidth: 3, lineCap: .round)
                        )
                        .frame(width: 58, height: 58)
                        .rotationEffect(.degrees(-90))
                    
                    // Lock icon
                    Image(systemName: "lock.fill")
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundColor(.white.opacity(0.4))
                }
            }
            
            // Selected checkmark
            if isSelected {
                Circle()
                    .fill(persona.primaryColor)
                    .frame(width: 22, height: 22)
                    .overlay(
                        Image(systemName: "checkmark")
                            .font(.system(size: 11, weight: .bold))
                            .foregroundColor(.white)
                    )
                    .offset(x: 22, y: -22)
            }
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
            .environmentObject(RelationshipArcService.shared)
    }
}
