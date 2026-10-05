import FerniShared
import SwiftUI

// MARK: - Meet Teammate Sheet
/// Opens when someone taps a teammate who isn't on their team yet. It should
/// feel like Ferni introducing a friend, not a paywall: who they are, what
/// they're good at, and a quiet way to bring them in now.

struct MeetTeammateSheet: View {
    let persona: Persona
    /// Called with the persona id when they want to start talking.
    let onTalk: (String) -> Void

    @StateObject private var model: PlanPurchaseModel
    @ObservedObject private var subscriptions: SubscriptionService

    init(persona: Persona, model: PlanPurchaseModel? = nil, onTalk: @escaping (String) -> Void) {
        let model = model ?? PlanPurchaseModel()
        self.persona = persona
        self.onTalk = onTalk
        _model = StateObject(wrappedValue: model)
        _subscriptions = ObservedObject(wrappedValue: model.service)
    }

    private var intro: TeammateIntroduction? { TeammateIntroduction.forPersona(persona.id) }
    private var plan: SubscriptionTier? { SubscriptionTier.plan(including: persona.id) }
    private var isOnTeam: Bool { subscriptions.currentTier.availablePersonas.contains(persona.id) }

    var body: some View {
        ScrollView {
            VStack(spacing: 22) {
                header
                if let intro {
                    ferniQuote(intro.ferniSays)
                    Text(intro.about)
                        .font(.system(size: 16, weight: .regular, design: .rounded))
                        .foregroundColor(.white.opacity(0.8))
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                    helpsWith(intro.helpsWith)
                }
                if isOnTeam {
                    welcome
                } else if let plan {
                    joinSection(plan)
                }
            }
            .padding(.horizontal, 24)
            .padding(.top, 32)
            .padding(.bottom, 24)
        }
        .background(Color(white: 0.10).ignoresSafeArea())
        .task { await model.loadPlansIfNeeded() }
        .preferredColorScheme(.dark)
    }

    // MARK: - Pieces

    private var header: some View {
        VStack(spacing: 10) {
            Circle()
                .fill(LinearGradient(
                    colors: [persona.primaryColor, persona.secondaryColor],
                    startPoint: .topLeading, endPoint: .bottomTrailing
                ))
                .frame(width: 84, height: 84)
                .shadow(color: persona.glowColor.opacity(0.4), radius: 14)
                .overlay(
                    Text(persona.initials)
                        .font(.system(size: 28, weight: .semibold, design: .rounded))
                        .foregroundColor(.white)
                )
                .accessibilityHidden(true)
            Text("Meet \(persona.name)")
                .font(.system(size: 28, weight: .semibold, design: .rounded))
                .foregroundColor(.white)
            Text(persona.role)
                .font(.system(size: 15, weight: .medium, design: .rounded))
                .foregroundColor(persona.primaryColor)
        }
    }

    private func ferniQuote(_ line: String) -> some View {
        VStack(spacing: 6) {
            Text("\u{201C}\(line)\u{201D}")
                .font(.system(size: 17, weight: .medium, design: .serif))
                .italic()
                .foregroundColor(.white.opacity(0.9))
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
            Text("Ferni")
                .font(.system(size: 13, weight: .semibold, design: .rounded))
                .foregroundColor(PersonaRegistry.ferni.primaryColor)
        }
        .padding(16)
        .frame(maxWidth: .infinity)
        .background(RoundedRectangle(cornerRadius: 16).fill(Color.white.opacity(0.05)))
        .accessibilityElement(children: .combine)
    }

    private func helpsWith(_ items: [String]) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("\(persona.name) can help with")
                .font(.system(size: 13, weight: .semibold, design: .rounded))
                .foregroundColor(.white.opacity(0.5))
            ForEach(items, id: \.self) { item in
                HStack(alignment: .firstTextBaseline, spacing: 10) {
                    Circle().fill(persona.primaryColor).frame(width: 6, height: 6)
                    Text(item)
                        .font(.system(size: 15, weight: .regular, design: .rounded))
                        .foregroundColor(.white.opacity(0.85))
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var welcome: some View {
        VStack(spacing: 12) {
            Text("\(persona.name)'s on your team now.")
                .font(.system(size: 17, weight: .semibold, design: .rounded))
                .foregroundColor(.white)
            if case .joined(_, let note?) = model.phase {
                caption(note)
            }
            primaryButton("Talk with \(persona.name)") { onTalk(persona.id) }
        }
    }

    private func joinSection(_ plan: SubscriptionTier) -> some View {
        VStack(spacing: 12) {
            primaryButton("Bring \(persona.name) onto your team", working: model.isWorking) {
                Task { await model.join(plan) }
            }
            caption(planLine(plan))
            switch model.phase {
            case .notice(let message):
                Text(message)
                    .font(.system(size: 15, weight: .medium, design: .rounded))
                    .foregroundColor(.white)
                    .multilineTextAlignment(.center)
            case .pending:
                caption("Waiting on approval. \(persona.name) joins as soon as it's through.")
            default:
                EmptyView()
            }
            caption("Or keep talking with Ferni. \(persona.name) joins when the time is right.")
            HStack(spacing: 18) {
                Button("Restore purchases") { Task { await model.restore() } }
                    .disabled(model.isWorking)
                Link("Terms", destination: URL(string: "https://ferni.ai/terms")!)
                Link("Privacy", destination: URL(string: "https://ferni.ai/privacy")!)
            }
            .font(.system(size: 13, weight: .medium, design: .rounded))
            .foregroundColor(.white.opacity(0.6))
            .padding(.top, 4)
        }
    }

    private func planLine(_ plan: SubscriptionTier) -> String {
        let who = "\(plan.teammateNames) all join with the \(plan.displayName) plan"
        guard let price = model.price(for: plan) else { return who + "." }
        return who + ", \(price) a month. Renews monthly until you cancel."
    }

    private func caption(_ text: String) -> some View {
        Text(text)
            .font(.system(size: 13, weight: .regular, design: .rounded))
            .foregroundColor(.white.opacity(0.55))
            .multilineTextAlignment(.center)
            .fixedSize(horizontal: false, vertical: true)
    }

    private func primaryButton(_ title: String, working: Bool = false, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            ZStack {
                Text(title).opacity(working ? 0 : 1)
                if working { ProgressView().tint(.white) }
            }
            .font(.system(size: 17, weight: .semibold, design: .rounded))
            .foregroundColor(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 16)
            .background(Capsule().fill(persona.primaryColor))
        }
        .disabled(working)
        .accessibilityLabel(title)
    }
}
