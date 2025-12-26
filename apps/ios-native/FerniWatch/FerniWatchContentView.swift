import SwiftUI
import FerniShared

// MARK: - Watch Content View
/// Main view for the Ferni Watch app.
/// Focused on quick mood check-ins and ambient presence.

struct FerniWatchContentView: View {
    @State private var currentMood: FerniComplicationEntry.MoodState = .unknown
    @State private var showCheckIn = false

    private let defaults = UserDefaults(suiteName: "group.com.ferni.shared")

    var body: some View {
        NavigationStack {
            VStack(spacing: 16) {
                // Ferni presence indicator
                ZStack {
                    Circle()
                        .fill(currentMood.color.opacity(0.3))
                        .frame(width: 80, height: 80)

                    Text(currentMood.emoji)
                        .font(.system(size: 40))
                }
                .onTapGesture {
                    showCheckIn = true
                }

                Text(greeting)
                    .font(.headline)
                    .foregroundColor(.white)

                Text(currentMood.description)
                    .font(.caption)
                    .foregroundColor(.gray)

                // Quick actions
                HStack(spacing: 12) {
                    QuickActionButton(icon: "bubble.left.fill", label: "Talk") {
                        openTalk()
                    }

                    QuickActionButton(icon: "face.smiling", label: "Check In") {
                        showCheckIn = true
                    }
                }
                .padding(.top, 8)
            }
            .padding()
        }
        .sheet(isPresented: $showCheckIn) {
            MoodCheckInSheet(currentMood: $currentMood)
        }
        .onAppear {
            loadMood()
        }
    }

    private var greeting: String {
        let hour = Calendar.current.component(.hour, from: Date())
        switch hour {
        case 5..<12: return "Good morning"
        case 12..<17: return "Hey there"
        case 17..<21: return "Good evening"
        default: return "Hey"
        }
    }

    private func loadMood() {
        if let moodString = defaults?.string(forKey: "lastMood"),
           let mood = FerniComplicationEntry.MoodState(rawValue: moodString) {
            currentMood = mood
        }
    }

    private func openTalk() {
        // Deep link to iPhone app for voice conversation
        // WatchConnectivity would handle this in production
    }
}

// MARK: - Quick Action Button

private struct QuickActionButton: View {
    let icon: String
    let label: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 4) {
                Image(systemName: icon)
                    .font(.title3)
                Text(label)
                    .font(.caption2)
            }
            .foregroundColor(.white)
            .frame(width: 60, height: 50)
            .background(Color.white.opacity(0.1))
            .cornerRadius(10)
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Mood Check-In Sheet

private struct MoodCheckInSheet: View {
    @Binding var currentMood: FerniComplicationEntry.MoodState
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
        defaults?.set(mood.rawValue, forKey: "lastMood")
        defaults?.set(Date(), forKey: "lastCheckIn")

        // Update streak
        let streak = (defaults?.integer(forKey: "checkInStreak") ?? 0) + 1
        defaults?.set(streak, forKey: "checkInStreak")

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
