import CoreGraphics
import SwiftUI
import UIKit

/// Ferni small and quiet beside a screen's intro line: the real rig and
/// shader, at rest, blinking and nothing else. Drawn as still images, made
/// for each blink and held between them, not a live Metal view: in a list row
/// a live view left the accessibility audit an element it couldn't resolve,
/// on every launch (2026-10-20).
public struct QuietAvatar: View {
    let persona: WindowPersona
    @Environment(\.colorScheme) private var scheme
    @Environment(\.displayScale) private var displayScale
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var picture: CGImage?

    public init(persona: WindowPersona) {
        self.persona = persona
    }

    public var body: some View {
        GeometryReader { geo in
            let side = min(geo.size.width, geo.size.height)
            Group {
                if picture != nil {
                    // A layer whose contents change, not a SwiftUI image swapped per
                    // frame: each swap was a new view, and a blink during the
                    // accessibility audit left it a node it couldn't resolve.
                    StillLayer(picture: picture)
                } else {
                    AvatarPortrait(persona: persona)
                }
            }
            .frame(width: side * AvatarView.canvas.width, height: side * AvatarView.canvas.height)
            .position(x: geo.size.width / 2, y: geo.size.height / 2 - side * AvatarView.lift)
            .task(id: "\(side)-\(scheme == .dark)-\(persona.rawValue)") { await blink(side: side) }
        }
        .aspectRatio(1, contentMode: .fit)
        .accessibilityHidden(true)
    }

    /// Ferni at rest, then each blink frame by frame, holding still between.
    private func blink(side: CGFloat) async {
        guard side > 0, AliveRenderer.shared != nil else { return }
        let rig = AliveRig(persona: persona)
        rig.blinksOnly = true
        rig.reduceMotion = reduceMotion
        rig.dark = scheme == .dark
        var t = 0.0
        // Settle the springs, then draw him at rest.
        while t < 1.5 { t += 1.0 / 60; _ = rig.frame(at: t) }
        picture = render(rig, at: t, side: side)
        while !Task.isCancelled {
            let wait = rig.secondsToNextBlink
            try? await Task.sleep(for: .seconds(max(0.2, wait)))
            guard !Task.isCancelled else { return }
            // Skip ahead to the blink, then 0.4 s of it at 30 frames a second.
            t += wait
            _ = rig.frame(at: t)
            for _ in 0..<12 {
                t += 1.0 / 30
                picture = render(rig, at: t, side: side)
                try? await Task.sleep(for: .seconds(1.0 / 30))
            }
        }
    }

    private func render(_ rig: AliveRig, at t: Double, side: CGFloat) -> CGImage? {
        let dark = scheme == .dark
        var u = rig.frame(at: t)
        u.light(dark: dark, roomTop: linear(hex: dark ? "#1e1a16" : "#faf8f5"), roomBottom: linear(hex: dark ? "#14110e" : "#efe9e0"))
        let w = Int(side * AvatarView.canvas.width * displayScale), h = Int(side * AvatarView.canvas.height * displayScale)
        u.frame(size: SIMD2(Float(w), Float(h)), radius: Float(AvatarView.radius / AvatarView.canvas.width) * Float(w),
                below: Float(AvatarView.lift / AvatarView.canvas.width) * Float(w))
        guard let bytes = AliveRenderer.shared?.image(u, width: w, height: h),
              let provider = CGDataProvider(data: Data(bytes) as CFData) else { return nil }
        let info = CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue)
        return CGImage(width: w, height: h, bitsPerComponent: 8, bitsPerPixel: 32, bytesPerRow: w * 4,
                       space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: info, provider: provider,
                       decode: nil, shouldInterpolate: true, intent: .defaultIntent)
    }
}

/// A plain layer showing `picture`, out of the accessibility tree.
private struct StillLayer: UIViewRepresentable {
    let picture: CGImage?

    func makeUIView(context: Context) -> UIView {
        let view = UIView()
        view.isAccessibilityElement = false
        view.accessibilityElementsHidden = true
        view.isUserInteractionEnabled = false
        view.layer.contentsGravity = .resizeAspect
        return view
    }

    func updateUIView(_ view: UIView, context: Context) {
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        view.layer.contents = picture
        CATransaction.commit()
    }
}
