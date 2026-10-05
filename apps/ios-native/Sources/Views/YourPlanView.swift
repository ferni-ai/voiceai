import SwiftUI

// MARK: - Your Plan
/// Settings > Your plan: who's on the team with the current plan, the other
/// plans, and restore / manage. Quiet on purpose; nothing here pushes.

struct YourPlanView: View {
    @StateObject private var model: PlanPurchaseModel
    @ObservedObject private var subscriptions: SubscriptionService

    init(model: PlanPurchaseModel? = nil) {
        let model = model ?? PlanPurchaseModel()
        _model = StateObject(wrappedValue: model)
        _subscriptions = ObservedObject(wrappedValue: model.service)
    }

    private var tier: SubscriptionTier { subscriptions.currentTier }

    /// Paid plans above the current one.
    private var otherPlans: [SubscriptionTier] {
        [SubscriptionTier.friend, .partner].filter {
            $0.availablePersonas.count > tier.availablePersonas.count
        }
    }

    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: 6) {
                    Text("\(tier.displayName) plan")
                        .font(.headline)
                    Text(summary)
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                }
                .padding(.vertical, 4)
                if tier != .free {
                    Button("Manage subscription") { Task { await subscriptions.manageSubscription() } }
                }
            } header: {
                Text("Right now")
            }

            ForEach(otherPlans, id: \.self) { plan in
                Section {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(plan.displayName).font(.headline)
                        Text("Brings in \(plan.teammateNames).")
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                        if let price = model.price(for: plan) {
                            Text("\(price) a month, renews until you cancel")
                                .font(.footnote)
                                .foregroundColor(.secondary)
                        }
                    }
                    .padding(.vertical, 4)
                    Button {
                        Task { await model.join(plan) }
                    } label: {
                        HStack {
                            Text("Choose \(plan.displayName)")
                            if model.isWorking { Spacer(); ProgressView() }
                        }
                    }
                    .disabled(model.isWorking)
                }
            }

            Section {
                Button("Restore purchases") { Task { await model.restore() } }
                    .disabled(model.isWorking)
            } footer: {
                VStack(alignment: .leading, spacing: 8) {
                    if let message = phaseMessage {
                        Text(message).foregroundColor(.primary)
                    }
                    Text("Plans are billed through your Apple ID and renew monthly until you cancel.")
                    HStack(spacing: 16) {
                        Link("Terms", destination: URL(string: "https://ferni.ai/terms")!)
                        Link("Privacy", destination: URL(string: "https://ferni.ai/privacy")!)
                    }
                }
            }
        }
        .navigationTitle("Your plan")
        .task { await model.loadPlansIfNeeded() }
    }

    private var summary: String {
        switch tier {
        case .free: return "Ferni's always here for you. A plan brings the rest of the team along."
        case .friend: return "\(tier.teammateNames) are on your team."
        case .partner: return "The whole team is with you, Nayan too."
        }
    }

    private var phaseMessage: String? {
        switch model.phase {
        case .notice(let message): return message
        case .pending: return "Waiting on approval. We'll bring them in as soon as it's through."
        case .joined(let joined, let note): return note ?? "You're on the \(joined.displayName) plan."
        case .idle, .working: return nil
        }
    }
}
