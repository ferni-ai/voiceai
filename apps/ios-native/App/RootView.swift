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
            case .talk: "Talk"
            case .team: "Team"
            case .remembers: "What Ferni remembers"
            case .settings: "Settings"
            }
        }

        var symbol: String {
            switch self {
            case .talk: "waveform"
            case .team: "person.3"
            case .remembers: "heart.text.square"
            case .settings: "gearshape"
            }
        }
    }

    var body: some View {
        if width == .regular {
            NavigationSplitView {
                List(Section.allCases, id: \.self, selection: $section) { item in
                    Label(item.title, systemImage: item.symbol)
                }
                .navigationTitle("Ferni")
            } detail: {
                switch section ?? .talk {
                case .talk: HomeView(showsAccountButton: false)
                case .team: TeamScreen(team: model.team) { section = .talk }
                case .remembers: NavigationStack { MemoryScreen(memory: model.memory) }
                case .settings: SettingsView(showsDone: false)
                }
            }
            .tint(FerniColor.accent)
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
        NavigationStack {
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
                }
                .buttonStyle(.plain)
                .disabled(!here)
                .accessibilityValue(team.chosen == persona.id ? "Answers next" : here ? "On your team" : "Not on your team yet")
            }
            .navigationTitle("Team")
        }
    }
}
