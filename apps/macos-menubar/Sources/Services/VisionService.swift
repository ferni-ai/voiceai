import Foundation
import Vision
import AppKit
import ScreenCaptureKit
import Combine
import os.log

// MARK: - Vision Service
/// Provides screenshot OCR and visual analysis
/// Detects error messages, reads documents, analyzes screen content

private let visionLog = Logger(subsystem: "com.ferni.voice", category: "Vision")

@available(macOS 12.3, *)
class VisionService: ObservableObject {

    // MARK: - Published State

    /// Last extracted text from screen
    @Published private(set) var lastExtractedText: String?

    /// Detected error messages
    @Published private(set) var detectedErrors: [DetectedError] = []

    /// Whether screen capture is available
    @Published private(set) var hasAccess: Bool = false

    /// Last analysis time
    @Published private(set) var lastAnalysisTime: Date?

    // MARK: - Private Properties

    private var availableContent: SCShareableContent?

    // MARK: - Initialization

    init() {
        Task {
            await checkAccess()
        }
    }

    // MARK: - Access

    /// Check if screen capture is available
    @MainActor
    func checkAccess() async {
        do {
            availableContent = try await SCShareableContent.current
            hasAccess = true
        } catch {
            print("[Vision] Screen capture not available: \(error)")
            hasAccess = false
        }
    }

    /// Open System Settings to Screen Recording section
    func openScreenRecordingSettings() {
        if let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture") {
            NSWorkspace.shared.open(url)
        }
    }

    // MARK: - Screen Capture

    /// Capture the main display (requires macOS 14.0+)
    @MainActor
    func captureScreen() async -> CGImage? {
        if #available(macOS 14.0, *) {
            if !hasAccess {
                await checkAccess()
            }
            guard hasAccess else { return nil }

            do {
                let content = try await SCShareableContent.current

                // Get the main display
                guard let display = content.displays.first else {
                    print("[Vision] No display found")
                    return nil
                }

                // Configure capture
                let filter = SCContentFilter(display: display, excludingWindows: [])
                let config = SCStreamConfiguration()
                config.width = Int(display.width)
                config.height = Int(display.height)
                config.pixelFormat = kCVPixelFormatType_32BGRA

                // Capture screenshot (macOS 14.0+)
                let image = try await SCScreenshotManager.captureImage(
                    contentFilter: filter,
                    configuration: config
                )

                return image

            } catch {
                print("[Vision] Screen capture failed: \(error)")
                return nil
            }
        } else {
            print("[Vision] Screen capture requires macOS 14.0+")
            return nil
        }
    }

    /// Capture a specific window (requires macOS 14.0+)
    @MainActor
    func captureWindow(matching title: String) async -> CGImage? {
        if #available(macOS 14.0, *) {
            guard hasAccess else { return nil }

            do {
                let content = try await SCShareableContent.current

                // Find window by title
                guard let window = content.windows.first(where: {
                    $0.title?.localizedCaseInsensitiveContains(title) == true
                }) else {
                    print("[Vision] Window not found: \(title)")
                    return nil
                }

                // Configure capture
                let filter = SCContentFilter(desktopIndependentWindow: window)
                let config = SCStreamConfiguration()
                config.width = Int(window.frame.width)
                config.height = Int(window.frame.height)
                config.pixelFormat = kCVPixelFormatType_32BGRA

                // Capture screenshot (macOS 14.0+)
                let image = try await SCScreenshotManager.captureImage(
                    contentFilter: filter,
                    configuration: config
                )

                return image

            } catch {
                print("[Vision] Window capture failed: \(error)")
                return nil
            }
        } else {
            print("[Vision] Window capture requires macOS 14.0+")
            return nil
        }
    }

    // MARK: - Text Extraction (OCR)

    /// Extract text from an image using Vision framework
    /// Note: Uses synchronous Vision API to avoid continuation leaks
    func extractText(from image: CGImage) async -> String {
        // Use the synchronous pattern - Vision's perform() is blocking
        // and will complete the request before returning
        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .accurate
        request.usesLanguageCorrection = true

        let handler = VNImageRequestHandler(cgImage: image, options: [:])

        do {
            try handler.perform([request])

            // Get results after perform() completes
            guard let observations = request.results else {
                visionLog.warning("OCR returned no results")
                return ""
            }

            // Extract all recognized text
            let text = observations.compactMap { observation in
                observation.topCandidates(1).first?.string
            }.joined(separator: "\n")

            visionLog.debug("OCR extracted \(observations.count) text observations")
            return text

        } catch {
            visionLog.error("Failed to perform OCR: \(error.localizedDescription)")
            return ""
        }
    }

    /// Extract text from screen
    @MainActor
    func extractTextFromScreen() async -> String {
        guard let image = await captureScreen() else { return "" }
        let text = await extractText(from: image)
        lastExtractedText = text
        lastAnalysisTime = Date()
        return text
    }

    // MARK: - Error Detection

    /// Analyze screen for error messages
    @MainActor
    func analyzeForErrors() async -> [DetectedError] {
        guard let image = await captureScreen() else { return [] }
        let text = await extractText(from: image)

        let errors = detectErrors(in: text)
        detectedErrors = errors
        lastAnalysisTime = Date()

        return errors
    }

    /// Detect error patterns in text
    private func detectErrors(in text: String) -> [DetectedError] {
        var errors: [DetectedError] = []

        let lines = text.components(separatedBy: .newlines)

        for (index, line) in lines.enumerated() {
            let lowercased = line.lowercased()

            // Check for common error patterns
            if let errorType = classifyErrorLine(lowercased, original: line) {
                errors.append(DetectedError(
                    id: UUID().uuidString,
                    type: errorType,
                    message: line,
                    context: getContext(lines: lines, around: index),
                    severity: errorType.defaultSeverity
                ))
            }
        }

        return errors
    }

    private func classifyErrorLine(_ lowercased: String, original: String) -> ErrorType? {
        // Fatal/crash errors
        if lowercased.contains("fatal error") || lowercased.contains("crash") ||
           lowercased.contains("segmentation fault") || lowercased.contains("sigabrt") {
            return .crash
        }

        // Build/compile errors
        if lowercased.contains("build failed") || lowercased.contains("compilation error") ||
           lowercased.contains("cannot find") || lowercased.contains("undefined reference") {
            return .build
        }

        // Type errors
        if lowercased.contains("type mismatch") || lowercased.contains("cannot convert") ||
           lowercased.contains("expected type") || lowercased.contains("type error") {
            return .type
        }

        // Network errors
        if lowercased.contains("connection refused") || lowercased.contains("timeout") ||
           lowercased.contains("network error") || lowercased.contains("host unreachable") {
            return .network
        }

        // Permission errors
        if lowercased.contains("permission denied") || lowercased.contains("access denied") ||
           lowercased.contains("not authorized") || lowercased.contains("unauthorized") {
            return .permission
        }

        // General errors
        if lowercased.contains("error:") || lowercased.contains("exception:") ||
           lowercased.contains("failed:") || lowercased.contains("[error]") {
            return .general
        }

        // Warnings
        if lowercased.contains("warning:") || lowercased.contains("[warn]") {
            return .warning
        }

        return nil
    }

    private func getContext(lines: [String], around index: Int, contextSize: Int = 2) -> String {
        let start = max(0, index - contextSize)
        let end = min(lines.count - 1, index + contextSize)
        return lines[start...end].joined(separator: "\n")
    }

    // MARK: - Document Analysis

    /// Analyze a document/image for key information
    func analyzeDocument(image: CGImage) async -> DocumentAnalysis {
        let text = await extractText(from: image)
        let lines = text.components(separatedBy: .newlines).filter { !$0.isEmpty }

        // Extract structured information
        var emails: [String] = []
        var urls: [String] = []
        var phones: [String] = []
        var dates: [String] = []

        let emailPattern = #"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}"#
        let urlPattern = #"https?://[^\s]+"#
        let phonePattern = #"\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}"#
        let datePattern = #"\d{1,2}/\d{1,2}/\d{2,4}|\d{4}-\d{2}-\d{2}"#

        for line in lines {
            emails.append(contentsOf: matches(for: emailPattern, in: line))
            urls.append(contentsOf: matches(for: urlPattern, in: line))
            phones.append(contentsOf: matches(for: phonePattern, in: line))
            dates.append(contentsOf: matches(for: datePattern, in: line))
        }

        return DocumentAnalysis(
            fullText: text,
            lineCount: lines.count,
            emails: Array(Set(emails)),
            urls: Array(Set(urls)),
            phones: Array(Set(phones)),
            dates: Array(Set(dates))
        )
    }

    private func matches(for pattern: String, in text: String) -> [String] {
        guard let regex = try? NSRegularExpression(pattern: pattern, options: []) else {
            return []
        }

        let range = NSRange(text.startIndex..., in: text)
        return regex.matches(in: text, options: [], range: range).compactMap { match in
            if let range = Range(match.range, in: text) {
                return String(text[range])
            }
            return nil
        }
    }

    // MARK: - Context Generation

    /// Generate context string for the agent
    func generateContextString() -> String {
        var parts: [String] = []

        if !detectedErrors.isEmpty {
            let criticalCount = detectedErrors.filter { $0.severity == .critical }.count
            let errorCount = detectedErrors.filter { $0.severity == .error }.count

            if criticalCount > 0 {
                parts.append("Detected \(criticalCount) critical errors on screen")
            } else if errorCount > 0 {
                parts.append("Detected \(errorCount) errors on screen")
            }

            // Include first error message
            if let firstError = detectedErrors.first {
                let truncated = String(firstError.message.prefix(100))
                parts.append("First error: \(truncated)")
            }
        }

        return parts.joined(separator: "\n")
    }

    /// Get vision context for data channel
    func getVisionContext() -> [String: Any] {
        var context: [String: Any] = [
            "hasAccess": hasAccess
        ]

        if !detectedErrors.isEmpty {
            context["errorCount"] = detectedErrors.count
            context["errors"] = detectedErrors.prefix(3).map { error in
                [
                    "type": error.type.rawValue,
                    "message": String(error.message.prefix(200)),
                    "severity": error.severity.rawValue
                ]
            }
        }

        return context
    }
}

// MARK: - Supporting Types

struct DetectedError: Identifiable {
    let id: String
    let type: ErrorType
    let message: String
    let context: String
    let severity: ErrorSeverity
}

enum ErrorType: String {
    case crash = "crash"
    case build = "build"
    case type = "type"
    case network = "network"
    case permission = "permission"
    case general = "general"
    case warning = "warning"

    var defaultSeverity: ErrorSeverity {
        switch self {
        case .crash: return .critical
        case .build, .type: return .error
        case .network, .permission, .general: return .error
        case .warning: return .warning
        }
    }
}

enum ErrorSeverity: String {
    case critical = "critical"
    case error = "error"
    case warning = "warning"
    case info = "info"
}

struct DocumentAnalysis {
    let fullText: String
    let lineCount: Int
    let emails: [String]
    let urls: [String]
    let phones: [String]
    let dates: [String]

    var summary: String {
        var parts: [String] = []
        parts.append("\(lineCount) lines of text")

        if !emails.isEmpty { parts.append("\(emails.count) emails") }
        if !urls.isEmpty { parts.append("\(urls.count) URLs") }
        if !phones.isEmpty { parts.append("\(phones.count) phone numbers") }
        if !dates.isEmpty { parts.append("\(dates.count) dates") }

        return parts.joined(separator: ", ")
    }
}
