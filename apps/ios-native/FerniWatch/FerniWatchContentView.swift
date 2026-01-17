import SwiftUI
import FerniShared

// MARK: - Watch Content View
/// Main view for the Ferni Watch app.
/// Focused on quick mood check-ins and ambient presence.
/// Now with real WatchConnectivity to trigger voice sessions on iPhone!

struct FerniWatchContentView: View {
    @StateObject private var connectivity = WatchConnectivityManager.shared
    @State private var currentMood: FerniComplicationEntry.MoodState = .unknown
    @State private var showCheckIn = false
    @State private var showingTalkConfirmation = false

    private let defaults = UserDefaults(suiteName: "group.com.ferni.shared")

    var body: some View {
        NavigationStack {
            VStack(spacing: 12) {
                // Connection status indicator
                if !connectivity.isReachable {
                    HStack(spacing: 4) {
                        Image(systemName: "iphone.slash")
                            .font(.caption2)
                        Text("iPhone not connected")
                            .font(.caption2)
                    }
                    .foregroundColor(.orange)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(Color.orange.opacity(0.2))
                    .cornerRadius(8)
                }
                
                // Ferni presence indicator
                ZStack {
                    // Voice state indicator ring
                    Circle()
                        .stroke(voiceStateColor, lineWidth: 3)
                        .frame(width: 86, height: 86)
                        .opacity(connectivity.voiceState != "disconnected" ? 1 : 0)
                    
                    Circle()
                        .fill(currentMood.color.opacity(0.3))
                        .frame(width: 80, height: 80)

                    Text(currentMood.emoji)
                        .font(.system(size: 40))
                }
                .onTapGesture {
                    showCheckIn = true
                }

                // Greeting with persona name
                Text(greeting)
                    .font(.headline)
                    .foregroundColor(.white)

                // Status line
                Text(statusText)
                    .font(.caption)
                    .foregroundColor(.gray)
                
                // Streak badge
                if connectivity.streakDays > 0 {
                    HStack(spacing: 4) {
                        Image(systemName: "flame.fill")
                            .foregroundColor(.orange)
                            .font(.caption2)
                        Text("\(connectivity.streakDays) day streak")
                            .font(.caption2)
                            .foregroundColor(.white.opacity(0.7))
                    }
                }

                // Quick actions
                HStack(spacing: 12) {
                    QuickActionButton(
                        icon: "bubble.left.fill",
                        label: "Talk",
                        isActive: connectivity.voiceState != "disconnected"
                    ) {
                        openTalk()
                    }

                    QuickActionButton(
                        icon: "face.smiling",
                        label: "Check In",
                        isActive: false
                    ) {
                        showCheckIn = true
                    }
                }
                .padding(.top, 4)
                
                // Additional actions row
                HStack(spacing: 12) {
                    QuickActionButton(
                        icon: "cloud.fill",
                        label: "Vent",
                        isActive: false
                    ) {
                        connectivity.requestQuickVent()
                    }
                    
                    QuickActionButton(
                        icon: "music.note",
                        label: "Calm",
                        isActive: false
                    ) {
                        connectivity.requestCalmingMusic()
                    }
                }
            }
            .padding()
        }
        .sheet(isPresented: $showCheckIn) {
            MoodCheckInSheet(currentMood: $currentMood, connectivity: connectivity)
        }
        .onAppear {
            loadMood()
            connectivity.requestStatus()
        }
        .onChange(of: connectivity.lastAcknowledgment) { _, newValue in
            if newValue != nil {
                // Could show haptic feedback here
            }
        }
    }
    
    // MARK: - Computed Properties

    private var greeting: String {
        let hour = Calendar.current.component(.hour, from: Date())
        let name = connectivity.currentPersonaName
        
        switch hour {
        case 5..<12: return "Good morning"
        case 12..<17: return "Hey there"
        case 17..<21: return "Good evening"
        default: return "Hey"
        }
    }
    
    private var statusText: String {
        switch connectivity.voiceState {
        case "connected", "listening":
            return "\(connectivity.currentPersonaName) is listening..."
        case "speaking":
            return "\(connectivity.currentPersonaName) is speaking..."
        case "thinking":
            return "\(connectivity.currentPersonaName) is thinking..."
        case "connecting":
            return "Connecting..."
        default:
            return currentMood.description
        }
    }
    
    private var voiceStateColor: Color {
        switch connectivity.voiceState {
        case "listening":
            return .green
        case "speaking":
            return .blue
        case "thinking":
            return .yellow
        case "connecting", "connected":
            return .white.opacity(0.5)
        default:
            return .clear
        }
    }
    
    // MARK: - Actions

    private func loadMood() {
        if let moodString = defaults?.string(forKey: "lastMood"),
           let mood = FerniComplicationEntry.MoodState(rawValue: moodString) {
            currentMood = mood
        }
    }

    private func openTalk() {
        if connectivity.isReachable {
            connectivity.requestVoiceSession()
        } else {
            showingTalkConfirmation = true
        }
    }
}

// MARK: - Quick Action Button

private struct QuickActionButton: View {
    let icon: String
    let label: String
    var isActive: Bool = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 4) {
                Image(systemName: icon)
                    .font(.title3)
                Text(label)
                    .font(.caption2)
            }
            .foregroundColor(isActive ? .green : .white)
            .frame(width: 60, height: 50)
            .background(
                RoundedRectangle(cornerRadius: 10)
                    .fill(isActive ? Color.green.opacity(0.2) : Color.white.opacity(0.1))
            )
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Mood Check-In Sheet

private struct MoodCheckInSheet: View {
    @Binding var currentMood: FerniComplicationEntry.MoodState
    @ObservedObject var connectivity: WatchConnectivityManager
    @Environment(\.dismiss) private var dismiss

    private let defaults = UserDefaults(suiteName: "group.com.ferni.shared")
    private let moods: [FerniComplicationEntry.MoodState] = [.great, .good, .okay, .meh, .low]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 12) {
                    Text("How are you feeling?")
                        .font(.headline)
                        .padding(.top)

                    ForEach(moods, id: \.rawValue) { mood in
                        Button {
                            selectMood(mood)
                        } label: {
                            HStack {
                                Text(mood.emoji)
                                    .font(.title2)
                                Text(mood.description)
                                    .foregroundColor(.white)
                                Spacer()
                                if currentMood == mood {
                                    Image(systemName: "checkmark.circle.fill")
                                        .foregroundColor(mood.color)
                                }
                            }
                            .padding(.horizontal, 12)
                            .padding(.vertical, 10)
                            .background(
                                RoundedRectangle(cornerRadius: 10)
                                    .fill(mood.color.opacity(currentMood == mood ? 0.3 : 0.1))
                            )
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding()
            }
            .navigationTitle("Check In")
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    private func selectMood(_ mood: FerniComplicationEntry.MoodState) {
        currentMood = mood
        
        // Save locally
        defaults?.set(mood.rawValue, forKey: "lastMood")
        defaults?.set(Date(), forKey: "lastCheckIn")

        // Update streak locally
        let streak = (defaults?.integer(forKey: "checkInStreak") ?? 0) + 1
        defaults?.set(streak, forKey: "checkInStreak")
        
        // Send to iPhone via WatchConnectivity
        connectivity.sendMoodCheckIn(mood: mood.rawValue)

        dismiss()
    }
}

// MARK: - Preview

#if DEBUG
struct FerniWatchContentView_Previews: PreviewProvider {
    static var previews: some View {
        FerniWatchContentView()
    }
}
#endif
