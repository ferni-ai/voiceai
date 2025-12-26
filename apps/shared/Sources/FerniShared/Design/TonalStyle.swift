import SwiftUI

// MARK: - Tonal Style System
/// Material-inspired tonal surfaces for buttons, chips, and interactive elements.
/// Provides warm, approachable surfaces with subtle elevation.
///
/// Usage:
///   Button("Action") { }
///       .tonalButton()
///
///   Text("Tag")
///       .tonalChip()
///
///   ForEach(items) { item in
///       Text(item.name)
///           .tonalListItem()
///   }

// MARK: - Tonal Elevation

/// The elevation level of a tonal surface
public enum TonalElevation: CaseIterable {
    case surface1  // Lowest - background cards
    case surface2  // Medium - interactive cards
    case surface3  // High - buttons, chips
    case hover     // Hover state
    case active    // Active/pressed state

    /// Background opacity for dark mode
    public var darkOpacity: Double {
        switch self {
        case .surface1: return 0.04
        case .surface2: return 0.08
        case .surface3: return 0.12
        case .hover: return 0.16
        case .active: return 0.20
        }
    }

    /// Background opacity for light mode
    public var lightOpacity: Double {
        switch self {
        case .surface1: return 0.02
        case .surface2: return 0.04
        case .surface3: return 0.06
        case .hover: return 0.08
        case .active: return 0.12
        }
    }
}

// MARK: - Tonal Background Modifier

public struct TonalBackgroundModifier: ViewModifier {
    let elevation: TonalElevation
    let cornerRadius: CGFloat
    @Environment(\.colorScheme) private var colorScheme

    public func body(content: Content) -> some View {
        content
            .background(
                RoundedRectangle(cornerRadius: cornerRadius)
                    .fill(backgroundColor)
            )
    }

    private var backgroundColor: Color {
        let opacity = colorScheme == .dark
            ? elevation.darkOpacity
            : elevation.lightOpacity

        // Dark mode: warm cedar tint, Light mode: natural ink tint
        let baseColor = colorScheme == .dark
            ? Color(hex: 0xE6C3A0)  // Warm cedar
            : Color(hex: 0x2C2520)  // Natural ink

        return baseColor.opacity(opacity)
    }
}

// MARK: - Interactive Tonal Modifier

public struct TonalButtonStyle: ButtonStyle {
    let personaColor: Color?
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.isEnabled) private var isEnabled

    public func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .padding(.horizontal, 20)
            .padding(.vertical, 12)
            .background(background(isPressed: configuration.isPressed))
            .clipShape(Capsule())
            .opacity(isEnabled ? 1 : 0.5)
            .animation(.easeOut(duration: 0.15), value: configuration.isPressed)
    }

    @ViewBuilder
    private func background(isPressed: Bool) -> some View {
        let elevation: TonalElevation = isPressed ? .active : .surface3
        let opacity = colorScheme == .dark
            ? elevation.darkOpacity
            : elevation.lightOpacity

        if let persona = personaColor {
            // Persona-tinted button
            Capsule()
                .fill(persona.opacity(opacity * 2))  // Slightly more visible for persona
        } else {
            // Neutral tonal button
            let baseColor = colorScheme == .dark
                ? Color(hex: 0xE6C3A0)
                : Color(hex: 0x2C2520)
            Capsule()
                .fill(baseColor.opacity(opacity))
        }
    }
}

// MARK: - Tonal Chip Modifier

public struct TonalChipModifier: ViewModifier {
    let isSelected: Bool
    let personaColor: Color?
    @Environment(\.colorScheme) private var colorScheme

    public func body(content: Content) -> some View {
        content
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .background(background)
            .clipShape(Capsule())
    }

    @ViewBuilder
    private var background: some View {
        let elevation: TonalElevation = isSelected ? .surface3 : .surface2
        let opacity = colorScheme == .dark
            ? elevation.darkOpacity
            : elevation.lightOpacity

        if isSelected, let persona = personaColor {
            Capsule()
                .fill(persona.opacity(opacity * 2.5))
        } else {
            let baseColor = colorScheme == .dark
                ? Color(hex: 0xE6C3A0)
                : Color(hex: 0x2C2520)
            Capsule()
                .fill(baseColor.opacity(opacity))
        }
    }
}

// MARK: - Tonal List Item Modifier

public struct TonalListItemModifier: ViewModifier {
    let isHighlighted: Bool
    @Environment(\.colorScheme) private var colorScheme

    public func body(content: Content) -> some View {
        content
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(backgroundColor)
            )
    }

    private var backgroundColor: Color {
        guard isHighlighted else { return .clear }

        let elevation: TonalElevation = .surface1
        let opacity = colorScheme == .dark
            ? elevation.darkOpacity
            : elevation.lightOpacity

        let baseColor = colorScheme == .dark
            ? Color(hex: 0xE6C3A0)
            : Color(hex: 0x2C2520)

        return baseColor.opacity(opacity)
    }
}

// MARK: - View Extensions

public extension View {

    /// Applies tonal background with specified elevation
    func tonalBackground(_ elevation: TonalElevation = .surface2, cornerRadius: CGFloat = 12) -> some View {
        modifier(TonalBackgroundModifier(elevation: elevation, cornerRadius: cornerRadius))
    }

    /// Applies tonal chip style
    func tonalChip(isSelected: Bool = false, personaColor: Color? = nil) -> some View {
        modifier(TonalChipModifier(isSelected: isSelected, personaColor: personaColor))
    }

    /// Applies tonal list item style
    func tonalListItem(isHighlighted: Bool = false) -> some View {
        modifier(TonalListItemModifier(isHighlighted: isHighlighted))
    }
}

public extension Button {
    /// Applies tonal button style
    func tonalButton(personaColor: Color? = nil) -> some View {
        buttonStyle(TonalButtonStyle(personaColor: personaColor))
    }
}

// MARK: - Preset Tonal Styles

public extension View {

    /// Card with tonal surface1 background
    func tonalCard() -> some View {
        tonalBackground(.surface1, cornerRadius: 16)
    }

    /// Interactive card with surface2 background
    func tonalInteractiveCard() -> some View {
        tonalBackground(.surface2, cornerRadius: 16)
    }
}

// MARK: - Preview

#if DEBUG
struct TonalStyle_Previews: PreviewProvider {
    static var previews: some View {
        ZStack {
            Color(hex: 0x584840)
                .ignoresSafeArea()

            VStack(spacing: 24) {
                // Tonal Button
                Button("Tonal Button") { }
                    .tonalButton()

                // Persona Button
                Button("Ferni Button") { }
                    .tonalButton(personaColor: FerniColors.ferni.primary)

                // Chips
                HStack(spacing: 12) {
                    Text("Unselected")
                        .tonalChip()

                    Text("Selected")
                        .tonalChip(isSelected: true)

                    Text("Persona")
                        .tonalChip(isSelected: true, personaColor: FerniColors.maya.primary)
                }

                // Cards
                VStack(spacing: 8) {
                    Text("Surface 1 Card")
                        .frame(maxWidth: .infinity)
                        .padding()
                        .tonalCard()

                    Text("Surface 2 Card")
                        .frame(maxWidth: .infinity)
                        .padding()
                        .tonalInteractiveCard()
                }

                // List Items
                VStack(spacing: 0) {
                    Text("Normal Item")
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .tonalListItem()

                    Text("Highlighted Item")
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .tonalListItem(isHighlighted: true)
                }
            }
            .padding()
            .foregroundColor(.white)
        }
        .preferredColorScheme(.dark)
    }
}
#endif
