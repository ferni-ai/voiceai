import SwiftUI
import UIKit
import WidgetKit

/// Ferni peeking up from the bottom edge: the Home Screen and StandBy widget.
/// Full colour uses the Metal-rendered portrait; in tinted and clear modes
/// the body is a plain shape and the eyes are the accented layer.
/// Shows nothing personal.
public struct FerniPeek: View {
    let accented: Bool
    let dark: Bool

    /// - Parameters:
    ///   - accented: the widget is drawn tinted or clear (`widgetRenderingMode != .fullColor`).
    ///   - dark: the dark portrait.
    public init(accented: Bool, dark: Bool) {
        self.accented = accented
        self.dark = dark
    }

    public var body: some View {
        GeometryReader { geo in
            let side = min(geo.size.width, geo.size.height) * 0.92
            ZStack {
                if accented {
                    Circle()
                        .fill(.white.opacity(0.35))
                        .frame(width: side, height: side)
                    // The eyes, where the portrait has them: the accented layer.
                    HStack(spacing: side * 0.16) {
                        ForEach(0..<2, id: \.self) { _ in
                            Ellipse().fill(.white).frame(width: side * 0.16, height: side * 0.22)
                        }
                    }
                    .offset(y: -side * 0.02)
                    .modifier(Accentable())
                } else if let image = AlivePortraits.image(.ferni, dark: dark) {
                    Image(uiImage: image).resizable().interpolation(.high).frame(width: side, height: side)
                }
            }
            // Peeking: the bottom third of Ferni is below the edge.
            .frame(width: geo.size.width, height: geo.size.height)
            .offset(y: side * 0.3)
        }
        .clipped()
        .accessibilityElement()
        .accessibilityLabel("Ferni")
    }
}

/// `widgetAccentable()` where WidgetKit is present; nothing elsewhere.
private struct Accentable: ViewModifier {
    func body(content: Content) -> some View {
        content.widgetAccentable()
    }
}
