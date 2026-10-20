import WidgetKit

/// Where Ferni's widgets can show and what they may do there.
///
/// Small widgets from a person's iPhone also appear on shared screens: CarPlay
/// and Apple HomeView, a household's screen (Apple HIG, Widgets, updated
/// 2026-10-13). A widget can't tell where it is, so a small one carries no
/// Talk: whoever taps it there may not be the phone's owner, and a call from
/// it would be one as them. A tap only opens Ferni on the iPhone. Medium
/// widgets show only on an iPhone or iPad's own Home Screen and Today View,
/// so they keep Talk (consent first, as everywhere).
enum SharedScreens {
    static func widgetOffersTalk(_ family: WidgetFamily) -> Bool {
        family == .systemMedium
    }
}
