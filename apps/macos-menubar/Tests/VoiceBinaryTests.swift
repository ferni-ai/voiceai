import XCTest
import Foundation

/// E2E tests for the voice binary
final class VoiceBinaryTests: XCTestCase {
    
    let binaryPath = "/Users/sethford/Documents/voiceai/apps/macos-menubar/.build/Ferni Voice.app/Contents/Resources/ferni-voice"
    let bundledBinaryPath = Bundle.main.resourceURL?.appendingPathComponent("ferni-voice").path ?? ""
    
    // MARK: - Binary Existence Tests
    
    func testVoiceBinaryExists() {
        let exists = FileManager.default.fileExists(atPath: binaryPath)
        XCTAssertTrue(exists, "Voice binary should exist at \(binaryPath)")
    }
    
    func testVoiceBinaryIsExecutable() {
        let isExecutable = FileManager.default.isExecutableFile(atPath: binaryPath)
        XCTAssertTrue(isExecutable, "Voice binary should be executable")
    }
    
    func testSoxIsInstalled() {
        let soxPaths = [
            "/opt/homebrew/bin/sox",
            "/usr/local/bin/sox",
            "/usr/bin/sox"
        ]
        
        let soxExists = soxPaths.contains { FileManager.default.isExecutableFile(atPath: $0) }
        XCTAssertTrue(soxExists, "sox should be installed (required for audio)")
    }
    
    // MARK: - Binary Help Test
    
    func testVoiceBinaryShowsHelp() {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: binaryPath)
        process.arguments = ["--help"]
        
        let pipe = Pipe()
        process.standardOutput = pipe
        process.standardError = pipe
        
        do {
            try process.run()
            process.waitUntilExit()
            
            let data = pipe.fileHandleForReading.readDataToEndOfFile()
            let output = String(data: data, encoding: .utf8) ?? ""
            
            XCTAssertTrue(output.contains("Ferni"), "Help should mention Ferni")
            XCTAssertTrue(output.contains("--persona"), "Help should mention --persona flag")
        } catch {
            XCTFail("Failed to run voice binary: \(error)")
        }
    }
    
    // MARK: - Environment Tests
    
    func testTokenServerIsReachable() async {
        // Test the /health endpoint instead
        let url = URL(string: "https://app.ferni.ai/health")!
        
        do {
            let (_, response) = try await URLSession.shared.data(from: url)
            if let httpResponse = response as? HTTPURLResponse {
                XCTAssertEqual(httpResponse.statusCode, 200,
                    "Health endpoint should return 200 (got \(httpResponse.statusCode))")
            }
        } catch {
            XCTFail("Token server not reachable: \(error)")
        }
    }
    
    // MARK: - Connection Test (Integration)
    
    func testVoiceBinaryCanConnect() {
        // This test actually tries to connect
        let expectation = XCTestExpectation(description: "Voice binary should connect")
        
        let process = Process()
        process.executableURL = URL(fileURLWithPath: binaryPath)
        process.arguments = ["--persona", "ferni"]
        
        // Set up environment
        var env = ProcessInfo.processInfo.environment
        env["CLI_TOKEN_SERVER"] = "https://app.ferni.ai"
        env["FERNI_SOUNDS"] = "mp3"
        env["PATH"] = "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:" + (env["PATH"] ?? "")
        env["HOME"] = NSHomeDirectory()
        env["TERM"] = "xterm-256color"
        process.environment = env
        
        let pipe = Pipe()
        process.standardOutput = pipe
        process.standardError = pipe
        
        var output = ""
        
        pipe.fileHandleForReading.readabilityHandler = { handle in
            let data = handle.availableData
            if let str = String(data: data, encoding: .utf8) {
                output += str
                print("[Test] \(str)")
                
                // Check for connection success
                if str.contains("Ready!") || str.contains("Microphone active") {
                    expectation.fulfill()
                }
                
                // Check for errors
                if str.contains("Error") || str.contains("failed") || str.contains("ECONNREFUSED") {
                    print("[Test] ERROR DETECTED: \(str)")
                }
            }
        }
        
        do {
            try process.run()
            
            // Wait for connection or timeout
            let result = XCTWaiter.wait(for: [expectation], timeout: 15.0)
            
            process.terminate()
            
            if result == .timedOut {
                print("[Test] Full output:\n\(output)")
                XCTFail("Voice binary did not connect within timeout. Output: \(output.suffix(500))")
            }
        } catch {
            XCTFail("Failed to run voice binary: \(error)")
        }
    }
}

