import FerniDesign
import FerniKit
import SwiftUI

/// iPhone: the room. iPad (regular width): a sidebar beside it, with the call
/// as its own full-height detail (UX spec §9). A call that starts brings the
/// room back to the front.
struct RootView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.horizontalSizeClass) private var width
    @State private var section: Section? = .talk

    enum Section: Hashable, CaseIterable {
        case talk, team, remembers, settings

        var title: String {
            switch self {
            case .talk: String(localized: "Talk")
            case .team: String(localized: "Team")
            case .remembers: String(localized: "What Ferni remembers")
            case .settings: String(localized: "Settings")
            }
        }

        var symbol: String {
            switch self {
            case .talk: "waveform"
            case .team: "person.2" // person.3 is wider than the sidebar's icon column
            case .remembers: "heart.text.square"
            case .settings: "gearshape"
            }
        }
    }

    var body: some View {
        @Bindable var model = model
        layout
            .alert(model.notice ?? "", isPresented: Binding(
                get: { model.notice != nil }, set: { if !$0 { model.notice = nil; model.noticeDetail = nil } }
            )) {
                Button("OK", role: .cancel) {}
            } message: {
                if let detail = model.noticeDetail { Text(detail) }
            }
            // Only a build the server names as too old; nothing can dismiss it.
            .fullScreenCover(isPresented: .constant(model.minimumBuild.updateRequired)) {
                UpdateRequiredView(message: model.minimumBuild.message)
            }
    }

    @ViewBuilder private var layout: some View {
        if width == .regular {
            NavigationSplitView {
                List(Section.allCases, id: \.self, selection: $section) { item in
                    Label {
                        // The selected row's words in the accent green measured 4.54:1
                        // on the grey selection; the primary text colour is clear of it.
                        Text(item.title)
                            .foregroundStyle(section == item ? FerniColor.textPrimary : Color.primary)
                    } icon: {
                        Image(systemName: item.symbol)
                    }
                }
                .navigationTitle("Ferni")
            } detail: {
                Group {
                    switch section ?? .talk {
                    case .talk: HomeView(showsAccountButton: false)
                    case .team: NavigationStack { TeamScreen(team: model.team) { section = .talk } }
                    case .remembers: NavigationStack { MemoryScreen(memory: model.memory, lock: model.memoryLock) }
                    case .settings: SettingsView(showsDone: false)
                    }
                }
                // The accent stays out of the sidebar: green text on the grey
                // selection fell below 4.5:1.
                .tint(FerniColor.accent)
            }
            .onChange(of: model.call.isActive) { _, active in if active { section = .talk } }
        } else {
            HomeView()
        }
    }
}

/// The whole team on iPad: who answers next, who's on your team, and why the
/// rest aren't yet, in their own words.
struct TeamScreen: View {
    let team: TeamStore
    let talk: () -> Void

    var body: some View {
        List(PersonaRegistry.all) { persona in
            let here = team.isOnTeam(persona.id)
            Button {
                if here { team.choose(persona.id); talk() }
            } label: {
                HStack(spacing: FerniSpace.pause) {
                    AvatarPortrait(persona: WindowPersona(personaId: persona.id), present: here)
                        .frame(width: 56, height: 56)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("\(persona.name) · \(persona.role)").font(FerniType.headline)
                        Text(here ? persona.specialty
                             : team.teasers[persona.id] ?? "\(persona.name) joins as you and Ferni get to know each other.")
                            .font(FerniType.body)
                            .foregroundStyle(FerniColor.textSecondary)
                    }
                    Spacer(minLength: 0)
                    if team.chosen == persona.id {
                        Image(systemName: "checkmark").foregroundStyle(FerniColor.accent).accessibilityHidden(true)
                    }
                }
                .frame(minHeight: 64)
                .contentShape(.rect)
            }
            .buttonStyle(.plain)
            .disabled(!here)
            .accessibilityValue(team.chosen == persona.id ? "Answers next" : here ? "On your team" : "Not on your team yet")
        }
        .navigationTitle("Team")
    }
}

/// This build is too old to keep using: say so plainly, and keep help close.
struct UpdateRequiredView: View {
    let message: String?

    var body: some View {
        VStack(spacing: FerniSpace.rest) {
            AvatarPortrait(persona: .ferni).frame(width: 96, height: 96)
            Text("Time for an update")
                .font(FerniType.greeting)
                .foregroundStyle(FerniColor.textPrimary)
            Text(message ?? String(localized: "This version of Ferni is out of date. Update Ferni from the App Store to keep talking."))
                .font(FerniType.bodyLarge)
                .foregroundStyle(FerniColor.textSecondary)
                .multilineTextAlignment(.center)
            Link(destination: URL(string: "tel:988")!) {
                Label("Need help now? Call 988", systemImage: "phone")
            }
            .tint(FerniColor.accent)
        }
        .padding(FerniSpace.meditation)
        .frame(maxWidth: 560)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(FerniColor.background)
        .interactiveDismissDisabled()
    }
}
