import SwiftUI
import FerniShared

#if os(iOS)
import UIKit
#endif

// MARK: - Transcript View
/// Shows the conversation history between user and personas.

struct TranscriptView: View {
    @EnvironmentObject var session: IOSLiveKitSession
    @Environment(\.dismiss) var dismiss

    var body: some View {
        NavigationView {
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(spacing: 12) {
                        ForEach(session.transcriptMessages) { message in
                            TranscriptBubble(message: message)
                                .id(message.id)
                        }
                    }
                    .padding()
                }
                .onChange(of: session.transcriptMessages.count) { _ in
                    // Scroll to bottom when new message arrives
                    if let lastMessage = session.transcriptMessages.last {
                        withAnimation(.easeOut(duration: 0.2)) {
                            proxy.scrollTo(lastMessage.id, anchor: .bottom)
                        }
                    }
                }
            }
            .background(Color.black)
            .navigationTitle("Conversation")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
                    .foregroundColor(.white)
                }
            }
            .toolbarBackground(Color(white: 0.1), for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
            #else
            .toolbar {
                ToolbarItem(placement: .automatic) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
            #endif
        }
        .preferredColorScheme(.dark)
    }
}

// MARK: - Transcript Bubble

struct TranscriptBubble: View {
    let message: TranscriptMessage

    var body: some View {
        HStack {
            if !message.isAgent {
                Spacer()
            }

            VStack(alignment: message.isAgent ? .leading : .trailing, spacing: 4) {
                // Speaker name
                Text(speakerName)
                    .font(.system(size: 12, weight: .medium, design: .rounded))
                    .foregroundColor(.white.opacity(0.5))

                // Message text
                Text(message.text)
                    .font(.system(size: 15, weight: .regular, design: .rounded))
                    .foregroundColor(.white.opacity(0.9))
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .background(
                        RoundedRectangle(cornerRadius: 16)
                            .fill(bubbleColor)
                    )

                // Timestamp
                Text(formattedTime)
                    .font(.system(size: 10, weight: .regular, design: .rounded))
                    .foregroundColor(.white.opacity(0.3))
            }
            .frame(maxWidth: 280, alignment: message.isAgent ? .leading : .trailing)

            if message.isAgent {
                Spacer()
            }
        }
    }

    private var speakerName: String {
        if message.isAgent {
            return PersonaRegistry.get(message.personaId).name
        } else {
            return "You"
        }
    }

    private var bubbleColor: Color {
        if message.isAgent {
            let persona = PersonaRegistry.get(message.personaId)
            return persona.primaryColor.opacity(0.3)
        } else {
            return Color.white.opacity(0.15)
        }
    }

    private var formattedTime: String {
        let formatter = DateFormatter()
        formatter.timeStyle = .short
        return formatter.string(from: message.timestamp)
    }
}

// MARK: - Preview

#Preview {
    TranscriptView()
        .environmentObject(IOSLiveKitSession())
}
