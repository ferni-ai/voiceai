import AVKit
import FerniDesign
import SwiftUI

/// The system's audio route button (speaker, AirPods, car, AirPlay), tinted to match.
struct AudioRoutePicker: UIViewRepresentable {
    func makeUIView(context: Context) -> AVRoutePickerView {
        let picker = AVRoutePickerView()
        picker.prioritizesVideoDevices = false
        picker.tintColor = UIColor(FerniColor.textSecondary)
        picker.activeTintColor = UIColor(FerniColor.accent)
        return picker
    }

    func updateUIView(_ uiView: AVRoutePickerView, context: Context) {}
}
