import SwiftUI

/// What the prototype drew around Ferni (sparkles, hearts, the firefly, and
/// a feeling's z, sweat, ? or !), from
/// `AliveRig.particles`. Drawn over the Metal canvas, which lights Ferni with
/// the firefly but doesn't draw it.
struct AliveParticles: View {
    let particles: [AliveRig.Particle]
    /// Ferni's centre in this view, and his radius, in points.
    let centre: CGPoint
    let radius: CGFloat

    var body: some View {
        Canvas { context, _ in
            for p in particles where p.alpha > 0.01 {
                let at = CGPoint(x: centre.x + p.x * radius, y: centre.y - p.y * radius)
                let r = p.size * radius
                context.opacity = p.alpha
                switch p.kind {
                case .sparkle:
                    context.fill(Self.star(at: at, r: r), with: .color(Color(red: 1, green: 0.95, blue: 0.78)))
                case .heart:
                    context.fill(Self.heart(at: at, r: r), with: .color(Color(red: 0.91, green: 0.64, blue: 0.62)))
                case .z, .question, .bang:
                    let mark = p.kind == .z ? "z" : p.kind == .question ? "?" : "!"
                    var text = context
                    text.translateBy(x: at.x, y: at.y)
                    text.rotate(by: .radians(p.rotation))
                    text.draw(Text(mark)
                        .font(.system(size: r, weight: .heavy, design: .rounded))
                        .foregroundStyle(FerniColor.textPrimary.opacity(p.kind == .z ? 0.65 : 1)), at: .zero)
                case .sweat:
                    context.fill(Self.drop(at: at, r: r), with: .linearGradient(
                        Gradient(colors: [Color(red: 0.85, green: 0.94, blue: 1), Color(red: 0.49, green: 0.75, blue: 0.94)]),
                        startPoint: CGPoint(x: at.x, y: at.y - r * 0.55), endPoint: CGPoint(x: at.x, y: at.y + r * 0.4)))
                    context.fill(Path(ellipseIn: CGRect(x: at.x - r * 0.17, y: at.y - r * 0.07, width: r * 0.14, height: r * 0.24)),
                                 with: .color(.white.opacity(0.8)))
                case .firefly:
                    let glow = CGRect(x: at.x - r * 2.5, y: at.y - r * 2.5, width: r * 5, height: r * 5)
                    context.fill(Path(ellipseIn: glow), with: .radialGradient(
                        Gradient(colors: [Color(red: 0.86, green: 1, blue: 0.5).opacity(0.55), .clear]),
                        center: at, startRadius: 0, endRadius: r * 2.5))
                    context.fill(Path(ellipseIn: CGRect(x: at.x - r * 0.45, y: at.y - r * 0.45, width: r * 0.9, height: r * 0.9)),
                                 with: .color(Color(red: 0.96, green: 1, blue: 0.7)))
                }
            }
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }

    /// A four-point star.
    static func star(at c: CGPoint, r: CGFloat) -> Path {
        var path = Path()
        for i in 0..<8 {
            let a = Double(i) * .pi / 4 - .pi / 2
            let d = i.isMultiple(of: 2) ? r : r * 0.28
            let pt = CGPoint(x: c.x + cos(a) * d, y: c.y + sin(a) * d)
            if i == 0 { path.move(to: pt) } else { path.addLine(to: pt) }
        }
        path.closeSubpath()
        return path
    }

    /// A bead of sweat: the prototype's drop, pointed at the top.
    static func drop(at c: CGPoint, r: CGFloat) -> Path {
        var path = Path()
        path.move(to: CGPoint(x: c.x, y: c.y - r * 0.55))
        path.addCurve(to: CGPoint(x: c.x, y: c.y + r * 0.4),
                      control1: CGPoint(x: c.x + r * 0.3, y: c.y - r * 0.1), control2: CGPoint(x: c.x + r * 0.35, y: c.y + r * 0.15))
        path.addCurve(to: CGPoint(x: c.x, y: c.y - r * 0.55),
                      control1: CGPoint(x: c.x - r * 0.35, y: c.y + r * 0.15), control2: CGPoint(x: c.x - r * 0.3, y: c.y - r * 0.1))
        return path
    }

    static func heart(at c: CGPoint, r: CGFloat) -> Path {
        var path = Path()
        path.move(to: CGPoint(x: c.x, y: c.y + r * 0.9))
        path.addCurve(to: CGPoint(x: c.x - r, y: c.y - r * 0.2),
                      control1: CGPoint(x: c.x - r * 0.3, y: c.y + r * 0.55), control2: CGPoint(x: c.x - r, y: c.y + r * 0.25))
        path.addArc(center: CGPoint(x: c.x - r * 0.5, y: c.y - r * 0.25), radius: r * 0.5, startAngle: .degrees(180), endAngle: .degrees(0), clockwise: false)
        path.addArc(center: CGPoint(x: c.x + r * 0.5, y: c.y - r * 0.25), radius: r * 0.5, startAngle: .degrees(180), endAngle: .degrees(0), clockwise: false)
        path.addCurve(to: CGPoint(x: c.x, y: c.y + r * 0.9),
                      control1: CGPoint(x: c.x + r, y: c.y + r * 0.25), control2: CGPoint(x: c.x + r * 0.3, y: c.y + r * 0.55))
        return path
    }
}
