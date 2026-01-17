// MARK: - Growth Radar Visualization
// Radar/spider chart showing personal growth across dimensions
// Matches the web visualization in builders/growth-radar.ts

import SwiftUI

struct GrowthRadarView: View {
    let data: GrowthRadarData
    var size: CGFloat = 200
    var showLabels: Bool = true
    var animated: Bool = true

    @State private var animationProgress: CGFloat = 0

    var body: some View {
        VStack(spacing: 16) {
            ZStack {
                // Background grid
                RadarGrid(
                    sides: data.dimensions.count,
                    levels: 5,
                    size: size
                )

                // Data polygon
                RadarPolygon(
                    values: data.dimensions.map { animated ? $0.value * animationProgress : $0.value },
                    size: size,
                    color: FerniColors.accent
                )

                // Previous values (ghost)
                if data.dimensions.contains(where: { $0.previousValue != nil }) {
                    RadarPolygon(
                        values: data.dimensions.map { ($0.previousValue ?? $0.value) * (animated ? animationProgress : 1) },
                        size: size,
                        color: FerniColors.textMuted.opacity(0.3),
                        filled: false
                    )
                }

                // Dimension labels
                if showLabels {
                    RadarLabels(
                        dimensions: data.dimensions,
                        size: size
                    )
                }

                // Center value
                VStack(spacing: 2) {
                    Text("\(Int(data.overallGrowth * 100))")
                        .font(.system(size: 24, weight: .bold, design: .rounded))
                        .foregroundColor(FerniColors.accent)

                    Text("overall")
                        .font(.system(size: 10, weight: .medium))
                        .foregroundColor(FerniColors.textMuted)
                }
            }
            .frame(width: size, height: size)

            // Focus area badge
            if let focusArea = data.focusArea {
                HStack(spacing: 6) {
                    Image(systemName: "scope")
                        .font(.system(size: 12))

                    Text("Focus: \(focusArea)")
                        .font(.system(size: 13, weight: .medium))
                }
                .foregroundColor(FerniColors.accent)
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(
                    Capsule()
                        .fill(FerniColors.accent.opacity(0.1))
                )
            }

            // Dimension list
            if showLabels {
                DimensionsList(dimensions: data.dimensions)
            }
        }
        .onAppear {
            if animated {
                withAnimation(.spring(response: 0.8, dampingFraction: 0.7)) {
                    animationProgress = 1
                }
            }
        }
    }
}

// MARK: - Radar Grid

private struct RadarGrid: View {
    let sides: Int
    let levels: Int
    let size: CGFloat

    var body: some View {
        Canvas { context, _ in
            let center = CGPoint(x: size / 2, y: size / 2)
            let radius = size / 2 - 30 // Padding for labels

            // Draw concentric polygons
            for level in 1...levels {
                let levelRadius = radius * CGFloat(level) / CGFloat(levels)
                let path = polygonPath(center: center, radius: levelRadius, sides: sides)

                context.stroke(
                    path,
                    with: .color(FerniColors.textPrimary.opacity(level == levels ? 0.2 : 0.08)),
                    lineWidth: level == levels ? 1.5 : 1
                )
            }

            // Draw spokes
            for i in 0..<sides {
                let angle = CGFloat(i) * (2 * .pi / CGFloat(sides)) - .pi / 2
                let endPoint = CGPoint(
                    x: center.x + radius * cos(angle),
                    y: center.y + radius * sin(angle)
                )

                var spokePath = Path()
                spokePath.move(to: center)
                spokePath.addLine(to: endPoint)

                context.stroke(
                    spokePath,
                    with: .color(FerniColors.textPrimary.opacity(0.08)),
                    lineWidth: 1
                )
            }
        }
        .frame(width: size, height: size)
    }

    private func polygonPath(center: CGPoint, radius: CGFloat, sides: Int) -> Path {
        var path = Path()
        let angleStep = 2 * .pi / CGFloat(sides)

        for i in 0..<sides {
            let angle = CGFloat(i) * angleStep - .pi / 2
            let point = CGPoint(
                x: center.x + radius * cos(angle),
                y: center.y + radius * sin(angle)
            )

            if i == 0 {
                path.move(to: point)
            } else {
                path.addLine(to: point)
            }
        }
        path.closeSubpath()
        return path
    }
}

// MARK: - Radar Polygon (Data)

private struct RadarPolygon: View {
    let values: [Double]
    let size: CGFloat
    let color: Color
    var filled: Bool = true

    var body: some View {
        Canvas { context, _ in
            let center = CGPoint(x: size / 2, y: size / 2)
            let maxRadius = size / 2 - 30

            var path = Path()
            let angleStep = 2 * .pi / CGFloat(values.count)

            for (i, value) in values.enumerated() {
                let angle = CGFloat(i) * angleStep - .pi / 2
                let radius = maxRadius * CGFloat(value)
                let point = CGPoint(
                    x: center.x + radius * cos(angle),
                    y: center.y + radius * sin(angle)
                )

                if i == 0 {
                    path.move(to: point)
                } else {
                    path.addLine(to: point)
                }
            }
            path.closeSubpath()

            if filled {
                context.fill(path, with: .color(color.opacity(0.2)))
            }
            context.stroke(path, with: .color(color), lineWidth: 2)

            // Draw points
            for (i, value) in values.enumerated() {
                let angle = CGFloat(i) * angleStep - .pi / 2
                let radius = maxRadius * CGFloat(value)
                let point = CGPoint(
                    x: center.x + radius * cos(angle),
                    y: center.y + radius * sin(angle)
                )

                let pointPath = Path(ellipseIn: CGRect(
                    x: point.x - 4,
                    y: point.y - 4,
                    width: 8,
                    height: 8
                ))
                context.fill(pointPath, with: .color(color))
            }
        }
        .frame(width: size, height: size)
    }
}

// MARK: - Radar Labels

private struct RadarLabels: View {
    let dimensions: [GrowthDimension]
    let size: CGFloat

    var body: some View {
        ForEach(Array(dimensions.enumerated()), id: \.element.id) { index, dimension in
            let angle = CGFloat(index) * (2 * .pi / CGFloat(dimensions.count)) - .pi / 2
            let radius = size / 2 + 5
            let x = radius * cos(angle)
            let y = radius * sin(angle)

            Text(dimension.name)
                .font(.system(size: 10, weight: .medium))
                .foregroundColor(FerniColors.textSecondary)
                .offset(x: x, y: y)
                .multilineTextAlignment(.center)
        }
    }
}

// MARK: - Dimensions List

private struct DimensionsList: View {
    let dimensions: [GrowthDimension]

    var body: some View {
        VStack(spacing: 8) {
            ForEach(dimensions) { dimension in
                HStack {
                    Text(dimension.name)
                        .font(.system(size: 13, weight: .medium))
                        .foregroundColor(FerniColors.textPrimary)

                    Spacer()

                    // Progress bar
                    GeometryReader { geometry in
                        ZStack(alignment: .leading) {
                            RoundedRectangle(cornerRadius: 2)
                                .fill(FerniColors.textPrimary.opacity(0.1))

                            RoundedRectangle(cornerRadius: 2)
                                .fill(FerniColors.accent)
                                .frame(width: geometry.size.width * CGFloat(dimension.value))
                        }
                    }
                    .frame(width: 60, height: 4)

                    Text("\(Int(dimension.value * 100))%")
                        .font(.system(size: 12, weight: .semibold, design: .rounded))
                        .foregroundColor(FerniColors.accent)
                        .frame(width: 36, alignment: .trailing)

                    // Trend indicator
                    Image(systemName: trendIcon(for: dimension.trend))
                        .font(.system(size: 10))
                        .foregroundColor(trendColor(for: dimension.trend))
                }
            }
        }
    }

    private func trendIcon(for trend: Trend) -> String {
        switch trend {
        case .growing: return "arrow.up"
        case .stable: return "minus"
        case .needsAttention: return "exclamationmark.triangle"
        default: return "minus"
        }
    }

    private func trendColor(for trend: Trend) -> Color {
        switch trend {
        case .growing: return FerniColors.statusColors.thriving
        case .stable: return FerniColors.textMuted
        case .needsAttention: return FerniColors.statusColors.stretched
        default: return FerniColors.textMuted
        }
    }
}

// MARK: - Card Wrapper

struct GrowthRadarCard: View {
    let data: GrowthRadarData

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            // Header
            HStack {
                Text("Growth Fingerprint")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundColor(FerniColors.textPrimary)

                Spacer()

                if let focus = data.focusArea {
                    Text(focus)
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(FerniColors.accent)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(
                            Capsule()
                                .fill(FerniColors.accent.opacity(0.1))
                        )
                }
            }

            GrowthRadarView(data: data, size: 200, showLabels: false)
                .frame(maxWidth: .infinity)

            DimensionsList(dimensions: data.dimensions)
        }
        .padding(20)
        .background(FerniColors.backgroundElevated)
        .cornerRadius(16)
        .cardShadow()
    }
}

// MARK: - Preview

#Preview("Growth Radar") {
    GrowthRadarCard(
        data: GrowthRadarData(
            dimensions: [
                GrowthDimension(name: "Self-Awareness", value: 0.75, previousValue: 0.65, trend: .growing),
                GrowthDimension(name: "Connection", value: 0.72, previousValue: 0.70, trend: .stable),
                GrowthDimension(name: "Emotional Range", value: 0.68, previousValue: 0.60, trend: .growing),
                GrowthDimension(name: "Resilience", value: 0.65, previousValue: 0.65, trend: .stable),
                GrowthDimension(name: "Boundaries", value: 0.60, previousValue: 0.55, trend: .growing),
                GrowthDimension(name: "Purpose", value: 0.58, previousValue: 0.62, trend: .needsAttention),
            ],
            overallGrowth: 0.66,
            focusArea: "Purpose"
        )
    )
    .padding()
    .background(FerniColors.background)
}
