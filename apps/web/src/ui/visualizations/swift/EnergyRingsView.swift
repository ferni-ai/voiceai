// MARK: - Energy Rings Visualization
// Apple Watch-style concentric rings showing energy levels
// Matches the web visualization in builders/energy-rings.ts

import SwiftUI

struct EnergyRingsView: View {
    let data: EnergyRingsData
    var size: CGFloat = 200
    var showLabels: Bool = true
    var animated: Bool = true

    @State private var animationProgress: CGFloat = 0

    var body: some View {
        VStack(spacing: 16) {
            // Rings
            ZStack {
                // Background rings
                ForEach(rings.indices, id: \.self) { index in
                    Circle()
                        .stroke(
                            FerniColors.textPrimary.opacity(0.1),
                            lineWidth: ringWidth
                        )
                        .frame(width: rings[index].radius * 2, height: rings[index].radius * 2)
                }

                // Progress rings
                ForEach(rings.indices, id: \.self) { index in
                    let ring = rings[index]
                    Circle()
                        .trim(from: 0, to: animated ? animationProgress * ring.progress : ring.progress)
                        .stroke(
                            ring.color,
                            style: StrokeStyle(
                                lineWidth: ringWidth,
                                lineCap: .round
                            )
                        )
                        .frame(width: ring.radius * 2, height: ring.radius * 2)
                        .rotationEffect(.degrees(-90))
                        .animation(
                            .spring(response: 0.8, dampingFraction: 0.7).delay(Double(index) * 0.1),
                            value: animationProgress
                        )

                    // End cap glow for complete rings
                    if ring.progress >= 1.0 {
                        Circle()
                            .fill(ring.color.opacity(0.6))
                            .frame(width: ringWidth + 4, height: ringWidth + 4)
                            .offset(y: -ring.radius)
                            .rotationEffect(.degrees(360 * Double(ring.progress) - 90))
                            .opacity(animated ? Double(animationProgress) : 1)
                    }
                }

                // Center overall display
                VStack(spacing: 2) {
                    Text("\(data.overall)")
                        .font(.system(size: size * 0.15, weight: .bold, design: .rounded))
                        .foregroundColor(data.status.color)

                    Text("%")
                        .font(.system(size: size * 0.06, weight: .medium))
                        .foregroundColor(FerniColors.textMuted)
                }
            }
            .frame(width: size, height: size)

            // Status badge
            Text(data.status.displayName)
                .font(.system(size: 14, weight: .semibold))
                .foregroundColor(data.status.color)
                .padding(.horizontal, 16)
                .padding(.vertical, 6)
                .background(
                    Capsule()
                        .fill(data.status.color.opacity(0.1))
                )

            // Legend (optional)
            if showLabels {
                HStack(spacing: 24) {
                    LegendItem(label: "Emotional", value: data.emotional, color: FerniColors.energy.emotional)
                    LegendItem(label: "Mental", value: data.mental, color: FerniColors.energy.mental)
                    LegendItem(label: "Physical", value: data.physical, color: FerniColors.energy.physical)
                }
                .padding(.top, 8)
            }
        }
        .onAppear {
            if animated {
                withAnimation {
                    animationProgress = 1
                }
            }
        }
    }

    // MARK: - Ring Configuration

    private var ringWidth: CGFloat {
        size * 0.07
    }

    private var rings: [(radius: CGFloat, progress: CGFloat, color: Color)] {
        let baseRadius = size * 0.42
        let spacing = ringWidth + 4

        return [
            (radius: baseRadius, progress: CGFloat(data.emotional) / 100, color: FerniColors.energy.emotional),
            (radius: baseRadius - spacing, progress: CGFloat(data.mental) / 100, color: FerniColors.energy.mental),
            (radius: baseRadius - spacing * 2, progress: CGFloat(data.physical) / 100, color: FerniColors.energy.physical),
        ]
    }
}

// MARK: - Legend Item

private struct LegendItem: View {
    let label: String
    let value: Int
    let color: Color

    var body: some View {
        HStack(spacing: 6) {
            Circle()
                .fill(color)
                .frame(width: 10, height: 10)

            VStack(alignment: .leading, spacing: 1) {
                Text(label)
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(FerniColors.textMuted)

                Text("\(value)%")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(FerniColors.textPrimary)
            }
        }
    }
}

// MARK: - Compact Energy Rings (for Watch/Widgets)

struct CompactEnergyRingsView: View {
    let data: EnergyRingsData
    var size: CGFloat = 70

    var body: some View {
        ZStack {
            // Background rings
            ForEach(0..<3, id: \.self) { index in
                Circle()
                    .stroke(FerniColors.textPrimary.opacity(0.1), lineWidth: 6)
                    .frame(width: ringSize(for: index), height: ringSize(for: index))
            }

            // Progress rings
            Circle()
                .trim(from: 0, to: CGFloat(data.emotional) / 100)
                .stroke(FerniColors.energy.emotional, style: StrokeStyle(lineWidth: 6, lineCap: .round))
                .frame(width: ringSize(for: 0), height: ringSize(for: 0))
                .rotationEffect(.degrees(-90))

            Circle()
                .trim(from: 0, to: CGFloat(data.mental) / 100)
                .stroke(FerniColors.energy.mental, style: StrokeStyle(lineWidth: 6, lineCap: .round))
                .frame(width: ringSize(for: 1), height: ringSize(for: 1))
                .rotationEffect(.degrees(-90))

            Circle()
                .trim(from: 0, to: CGFloat(data.physical) / 100)
                .stroke(FerniColors.energy.physical, style: StrokeStyle(lineWidth: 6, lineCap: .round))
                .frame(width: ringSize(for: 2), height: ringSize(for: 2))
                .rotationEffect(.degrees(-90))

            // Center percentage
            Text("\(data.overall)%")
                .font(.system(size: size * 0.18, weight: .bold, design: .rounded))
                .foregroundColor(data.status.color)
        }
        .frame(width: size, height: size)
    }

    private func ringSize(for index: Int) -> CGFloat {
        size - CGFloat(index) * 16
    }
}

// MARK: - Card Wrapper

struct EnergyRingsCard: View {
    let data: EnergyRingsData

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            // Header
            HStack {
                Text("Energy Levels")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundColor(FerniColors.textPrimary)

                Spacer()

                Text("Now")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(FerniColors.textMuted)
            }

            // Rings
            EnergyRingsView(data: data, size: 160, showLabels: true)
                .frame(maxWidth: .infinity)

            // Insight
            Text(insightText)
                .font(.system(size: 14))
                .foregroundColor(FerniColors.textSecondary)
                .lineLimit(2)
        }
        .padding(20)
        .background(FerniColors.backgroundElevated)
        .cornerRadius(16)
        .cardShadow()
    }

    private var insightText: String {
        let lowest = min(data.emotional, data.mental, data.physical)

        if data.overall >= 80 {
            return "All systems balanced. Great time for challenging tasks."
        }

        if lowest == data.emotional {
            return "Consider connecting with someone supportive today."
        } else if lowest == data.mental {
            return "A short break could help restore mental clarity."
        } else {
            return "Gentle movement or rest could replenish your energy."
        }
    }
}

// MARK: - Preview

#Preview("Energy Rings") {
    VStack(spacing: 32) {
        EnergyRingsView(
            data: EnergyRingsData(
                emotional: 75,
                mental: 82,
                physical: 68,
                overall: 72
            )
        )

        CompactEnergyRingsView(
            data: EnergyRingsData(
                emotional: 75,
                mental: 82,
                physical: 68,
                overall: 72
            )
        )
    }
    .padding()
    .background(FerniColors.background)
}

#Preview("Energy Rings Card") {
    EnergyRingsCard(
        data: EnergyRingsData(
            emotional: 75,
            mental: 82,
            physical: 68,
            overall: 72
        )
    )
    .padding()
    .background(FerniColors.background)
}
