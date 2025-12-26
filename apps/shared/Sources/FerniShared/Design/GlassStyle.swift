import SwiftUI

// MARK: - Glass Style System
/// Apple visionOS-inspired glass effects for premium UI surfaces.
/// Use for modals, sheets, and floating overlays.
///
/// Usage:
///   SomeView()
///       .glassBackground(.regular)
///       .glassBorder(.regular)
///
///   SomeView()
///       .glassCard()  // Preset for cards
///
///   SomeView()
///       .glassModal() // Preset for modals

// MARK: - Glass Thickness

/// The thickness/intensity of the glass effect
public enum GlassThickness: CaseIterable {
    case ultraThin
    case thin
    case regular
    case thick
    case ultraThick
    case chromatic  // Persona-tinted glass

    /// Background opacity (0-1)
    public var backgroundOpacity: Double {
        switch self {
        case .ultraThin: return 0.02
        case .thin: return 0.04
        case .regular: return 0.08
        case .thick: return 0.12
        case .ultraThick: return 0.16
        case .chromatic: return 0.06
        }
    }

    /// Light mode background opacity (higher for visibility)
    public var lightBackgroundOpacity: Double {
        switch self {
        case .ultraThin: return 0.50
        case .thin: return 0.60
        case .regular: return 0.70
        case .thick: return 0.80
        case .ultraThick: return 0.90
        case .chromatic: return 0.06
        }
    }

    /// Blur radius in points
    public var blurRadius: CGFloat {
        switch self {
        case .ultraThin: return 4
        case .thin: return 8
        case .regular: return 16
        case .thick: return 24
        case .ultraThick: return 40
        case .chromatic: return 20
        }
    }

    /// Border opacity
    public var borderOpacity: Double {
        switch self {
        case .ultraThin: return 0.04
        case .thin: return 0.06
        case .regular: return 0.10
        case .thick: return 0.14
        case .ultraThick: return 0.18
        case .chromatic: return 0.12
        }
    }

    /// Corner radius for this glass level
    public var cornerRadius: CGFloat {
        switch self {
        case .ultraThin, .thin: return 12
        case .regular: return 16
        case .thick: return 20
        case .ultraThick, .chromatic: return 24
        }
    }
}

// MARK: - Glass Background Modifier

public struct GlassBackgroundModifier: ViewModifier {
    let thickness: GlassThickness
    let personaColor: Color?
    @Environment(\.colorScheme) private var colorScheme

    public func body(content: Content) -> some View {
        content
            .background(glassBackground)
    }

    @ViewBuilder
    private var glassBackground: some View {
        if thickness == .chromatic, let persona = personaColor {
            // Chromatic glass uses persona tint
            persona
                .opacity(thickness.backgroundOpacity)
                .blur(radius: thickness.blurRadius)
        } else {
            // Standard glass uses white/black based on color scheme
            let opacity = colorScheme == .dark
                ? thickness.backgroundOpacity
                : thickness.lightBackgroundOpacity

            Color.white
                .opacity(opacity)
                .blur(radius: thickness.blurRadius)
        }
    }
}

// MARK: - Glass Border Modifier

public struct GlassBorderModifier: ViewModifier {
    let thickness: GlassThickness
    let personaColor: Color?
    @Environment(\.colorScheme) private var colorScheme

    public func body(content: Content) -> some View {
        content
            .overlay(
                RoundedRectangle(cornerRadius: thickness.cornerRadius)
                    .strokeBorder(borderColor, lineWidth: 1)
            )
    }

    private var borderColor: Color {
        if thickness == .chromatic, let persona = personaColor {
            return persona.opacity(thickness.borderOpacity)
        } else {
            let baseColor: Color = colorScheme == .dark ? .white : .black
            return baseColor.opacity(thickness.borderOpacity)
        }
    }
}

// MARK: - Glass Shadow Modifier

public struct GlassShadowModifier: ViewModifier {
    let thickness: GlassThickness

    public func body(content: Content) -> some View {
        content
            .shadow(
                color: .black.opacity(shadowOpacity),
                radius: shadowRadius,
                x: 0,
                y: shadowY
            )
    }

    private var shadowOpacity: Double {
        switch thickness {
        case .ultraThin: return 0.04
        case .thin: return 0.06
        case .regular: return 0.08
        case .thick: return 0.10
        case .ultraThick: return 0.12
        case .chromatic: return 0.08
        }
    }

    private var shadowRadius: CGFloat {
        switch thickness {
        case .ultraThin: return 2
        case .thin: return 4
        case .regular: return 8
        case .thick: return 16
        case .ultraThick: return 24
        case .chromatic: return 12
        }
    }

    private var shadowY: CGFloat {
        switch thickness {
        case .ultraThin: return 1
        case .thin: return 2
        case .regular: return 4
        case .thick: return 8
        case .ultraThick: return 16
        case .chromatic: return 4
        }
    }
}

// MARK: - Complete Glass Effect Modifier

public struct GlassEffectModifier: ViewModifier {
    let thickness: GlassThickness
    let personaColor: Color?
    @Environment(\.colorScheme) private var colorScheme

    public func body(content: Content) -> some View {
        content
            .modifier(GlassBackgroundModifier(thickness: thickness, personaColor: personaColor))
            .clipShape(RoundedRectangle(cornerRadius: thickness.cornerRadius))
            .modifier(GlassBorderModifier(thickness: thickness, personaColor: personaColor))
            .modifier(GlassShadowModifier(thickness: thickness))
    }
}

// MARK: - View Extensions

public extension View {

    /// Applies glass background with specified thickness
    func glassBackground(_ thickness: GlassThickness = .regular, personaColor: Color? = nil) -> some View {
        modifier(GlassBackgroundModifier(thickness: thickness, personaColor: personaColor))
    }

    /// Applies glass border with specified thickness
    func glassBorder(_ thickness: GlassThickness = .regular, personaColor: Color? = nil) -> some View {
        modifier(GlassBorderModifier(thickness: thickness, personaColor: personaColor))
    }

    /// Applies glass shadow with specified thickness
    func glassShadow(_ thickness: GlassThickness = .regular) -> some View {
        modifier(GlassShadowModifier(thickness: thickness))
    }

    /// Applies complete glass effect (background + border + shadow)
    func glassEffect(_ thickness: GlassThickness = .regular, personaColor: Color? = nil) -> some View {
        modifier(GlassEffectModifier(thickness: thickness, personaColor: personaColor))
    }

    // MARK: - Preset Glass Styles

    /// Glass card preset - thin glass for cards and list items
    func glassCard() -> some View {
        glassEffect(.thin)
    }

    /// Glass modal preset - thick glass for modal dialogs
    func glassModal() -> some View {
        glassEffect(.thick)
    }

    /// Glass sheet preset - ultra thick glass for full-height sheets
    func glassSheet() -> some View {
        glassEffect(.ultraThick)
    }

    /// Glass popover preset - regular glass for popovers and menus
    func glassPopover() -> some View {
        glassEffect(.regular)
    }

    /// Chromatic glass preset - persona-tinted glass
    func glassChromatic(color: Color) -> some View {
        glassEffect(.chromatic, personaColor: color)
    }
}

// MARK: - Preview

#if DEBUG
struct GlassStyle_Previews: PreviewProvider {
    static var previews: some View {
        ZStack {
            // Background gradient to show glass effect
            LinearGradient(
                colors: [
                    Color(hex: 0x584840),
                    Color(hex: 0x70605a)
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()

            VStack(spacing: 24) {
                // Ultra Thin
                Text("Ultra Thin Glass")
                    .padding()
                    .frame(maxWidth: .infinity)
                    .glassEffect(.ultraThin)

                // Thin
                Text("Thin Glass (Card)")
                    .padding()
                    .frame(maxWidth: .infinity)
                    .glassCard()

                // Regular
                Text("Regular Glass")
                    .padding()
                    .frame(maxWidth: .infinity)
                    .glassPopover()

                // Thick
                Text("Thick Glass (Modal)")
                    .padding()
                    .frame(maxWidth: .infinity)
                    .glassModal()

                // Chromatic
                Text("Chromatic (Ferni)")
                    .padding()
                    .frame(maxWidth: .infinity)
                    .glassChromatic(color: FerniColors.ferni.primary)
            }
            .padding()
            .foregroundColor(.white)
        }
        .preferredColorScheme(.dark)
    }
}
#endif
