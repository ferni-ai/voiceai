import FerniDesign
import FerniKit
import SwiftUI

/// iPhone: the room. iPad (regular width): a sidebar beside it, with the call
/// as its own full-height detail (UX spec §9). A call that starts brings the
/// room back to the front.
struct RootView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.horizontalSizeClass) private var width
    @Environment(\.dynamicTypeSize) private var typeSize
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
            .sheet(isPresented: $model.isShowingHelp) {
                NavigationStack {
                    HelpView().toolbar {
                        ToolbarItem(placement: .confirmationAction) { Button("Done") { model.isShowingHelp = false } }
                    }
                }
            }
            .alert(model.notice ?? "", isPresented: Binding(
                get: { model.notice != nil }, set: { if !$0 { model.notice = nil; model.noticeDetail = nil } }
            )) {
                Button("OK", role: .cancel) {}
            } message: {
                if let detail = model.noticeDetail { Text(detail) }
            }
            // Talk refused for the waitlist: their place in line, not an error.
            // Over the whole app, so the iPad sidebar isn't left behind it.
            .fullScreenCover(item: Binding(
                get: { model.call.waitlist }, set: { if $0 == nil { model.call.closeWaitlist() } }
            )) { place in
                WaitingView(place: place, onClose: { model.call.closeWaitlist() }, onComeIn: {
                    model.call.closeWaitlist()
                    model.talk()
                })
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
                // At accessibility sizes a wider sidebar: at AX5 its default width broke
                // "Settings" across two lines with a hyphen (design audit P2 #17).
                .navigationSplitViewColumnWidth(typeSize.isAccessibilitySize ? 420 : 320)
                // Ferni's room colour, not the system's glass: over the glass the
                // accessibility audit failed every row's contrast (often without
                // naming it), though the pixels measure 19.7:1 (2026-10-20).
                .scrollContentBackground(.hidden)
                .background(FerniColor.background)
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
            // On iPad, Settings is the sidebar's page, never a sheet over Home
            // (which half-covered Home and clipped its own last rows).
            .onChange(of: model.isShowingSettings, initial: true) { _, showing in
                guard showing else { return }
                section = .settings
                model.isShowingSettings = false
            }
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
        List {
            ForEach(PersonaRegistry.all) { persona in
                let here = team.isOnTeam(persona.id)
                if here {
                    Button {
                        team.choose(persona.id); talk()
                    } label: { row(persona, here: true) }
                    .buttonStyle(.plain)
                    .accessibilityValue(team.chosen == persona.id ? "Answers next" : "On your team")
                } else {
                    // Not a dimmed button: information, in the secondary text colour. Disabled,
                    // the system greyed it to #ada9a4, 2.34:1 (design audit P1-15).
                    row(persona, here: false)
                        .accessibilityElement(children: .combine)
                        .accessibilityValue("Not on your team yet")
                        .accessibilityIdentifier("team.notYet.\(persona.id)")
                }
            }
        }
        .ferniPaper()
        .screenIntro(ScreenIntro.team)
        .navigationTitle("Team")
    }

    private func row(_ persona: Persona, here: Bool) -> some View {
        HStack(spacing: FerniSpace.pause) {
            AvatarPortrait(persona: WindowPersona(personaId: persona.id), present: here)
                .frame(width: 56, height: 56)
            VStack(alignment: .leading, spacing: 2) {
                Text("\(persona.name) · \(persona.role)")
                    .font(FerniType.headline)
                    .foregroundStyle(here ? FerniColor.textPrimary : FerniColor.textSecondary)
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
