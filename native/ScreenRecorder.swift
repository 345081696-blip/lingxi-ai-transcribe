import Foundation
import ScreenCaptureKit
import AVFoundation
import CoreMedia
import CoreGraphics

final class RecorderDelegate: NSObject, SCRecordingOutputDelegate {
    let onStart: () -> Void
    let onFinish: () -> Void
    let onError: (Error) -> Void

    init(onStart: @escaping () -> Void, onFinish: @escaping () -> Void, onError: @escaping (Error) -> Void) {
        self.onStart = onStart
        self.onFinish = onFinish
        self.onError = onError
    }

    func recordingOutputDidStartRecording(_ recordingOutput: SCRecordingOutput) {
        onStart()
    }

    func recordingOutputDidFinishRecording(_ recordingOutput: SCRecordingOutput) {
        onFinish()
    }

    func recordingOutput(_ recordingOutput: SCRecordingOutput, didFailWithError error: Error) {
        onError(error)
    }
}

final class NativeRecorder {
    private var stream: SCStream?
    private var recordingOutput: SCRecordingOutput?
    private var delegate: RecorderDelegate?
    private var outputURL: URL
    private var audioMode: String
    private var screenOrigin: CGPoint?
    private var cropRect: CGRect?
    private var excludedBundleID: String?
    private var isStopping = false

    init(outputURL: URL, audioMode: String, screenOrigin: CGPoint?, cropRect: CGRect?, excludedBundleID: String?) {
        self.outputURL = outputURL
        self.audioMode = audioMode
        self.screenOrigin = screenOrigin
        self.cropRect = cropRect
        self.excludedBundleID = excludedBundleID
    }

    func start() async throws {
        let content = try await SCShareableContent.current
        guard let display = pickDisplay(from: content.displays) else {
            throw NSError(domain: "NativeRecorder", code: 1, userInfo: [NSLocalizedDescriptionKey: "没有找到可录制的屏幕。"])
        }

        let excludedApps = content.applications.filter { app in
            app.bundleIdentifier == excludedBundleID || app.applicationName == "零创 AI 智能转写"
        }
        let filter = SCContentFilter(display: display, excludingApplications: excludedApps, exceptingWindows: [])
        let config = SCStreamConfiguration()
        if let cropRect {
            config.sourceRect = cropRect
            config.width = max(2, Int(cropRect.width))
            config.height = max(2, Int(cropRect.height))
        } else {
            config.width = Int(display.width)
            config.height = Int(display.height)
        }
        config.minimumFrameInterval = CMTime(value: 1, timescale: 30)
        config.pixelFormat = kCVPixelFormatType_32BGRA
        config.showsCursor = true
        config.queueDepth = 8
        config.capturesAudio = audioMode == "system"
        if #available(macOS 15.0, *) {
            config.captureMicrophone = audioMode == "microphone"
        }
        config.excludesCurrentProcessAudio = true
        config.sampleRate = 48_000
        config.channelCount = 2

        let recordingConfig = SCRecordingOutputConfiguration()
        recordingConfig.outputURL = outputURL
        recordingConfig.outputFileType = .mp4
        recordingConfig.videoCodecType = .h264

        let delegate = RecorderDelegate(
            onStart: { emit(["event": "started", "filePath": self.outputURL.path, "audioMode": self.audioMode]) },
            onFinish: {
                emit(["event": "finished", "filePath": self.outputURL.path])
                CFRunLoopStop(CFRunLoopGetMain())
            },
            onError: { error in
                if self.isStopping && FileManager.default.fileExists(atPath: self.outputURL.path) {
                    emit(["event": "finished", "filePath": self.outputURL.path, "message": error.localizedDescription])
                } else {
                    emit(["event": "error", "message": error.localizedDescription])
                }
                CFRunLoopStop(CFRunLoopGetMain())
            }
        )
        self.delegate = delegate

        let recordingOutput = SCRecordingOutput(configuration: recordingConfig, delegate: delegate)
        let stream = SCStream(filter: filter, configuration: config, delegate: nil)
        try stream.addRecordingOutput(recordingOutput)
        self.recordingOutput = recordingOutput
        self.stream = stream
        try await stream.startCapture()
        emit([
            "event": "captureStarted",
            "filePath": outputURL.path,
            "audioMode": audioMode,
            "displayWidth": Int(display.width),
            "displayHeight": Int(display.height),
            "region": cropRect.map { ["x": Int($0.origin.x), "y": Int($0.origin.y), "width": Int($0.width), "height": Int($0.height)] } ?? NSNull(),
            "excludedApps": excludedApps.map { $0.applicationName }
        ])
    }

    private func pickDisplay(from displays: [SCDisplay]) -> SCDisplay? {
        guard let screenOrigin else {
            return displays.first
        }
        return displays.first { display in
            abs(display.frame.origin.x - screenOrigin.x) < 2 && abs(display.frame.origin.y - screenOrigin.y) < 2
        } ?? displays.first
    }

    func stop() {
        guard !isStopping else { return }
        isStopping = true
        Task {
            if let stream {
                do {
                    try await stream.stopCapture()
                } catch {
                    if FileManager.default.fileExists(atPath: outputURL.path) {
                        emit(["event": "finished", "filePath": outputURL.path, "message": error.localizedDescription])
                    } else {
                        emit(["event": "error", "message": error.localizedDescription])
                    }
                    CFRunLoopStop(CFRunLoopGetMain())
                }
            } else {
                CFRunLoopStop(CFRunLoopGetMain())
            }
        }
    }
}

func emit(_ object: [String: Any]) {
    if let data = try? JSONSerialization.data(withJSONObject: object),
       let line = String(data: data, encoding: .utf8) {
        if let output = "\(line)\n".data(using: .utf8) {
            FileHandle.standardOutput.write(output)
        }
    }
}

func usage() -> Never {
    fputs("Usage: native-recorder start <output.mp4> [system|microphone] [screenX screenY regionX regionY regionW regionH] [excludedBundleID]\n", stderr)
    exit(2)
}

guard CommandLine.arguments.count >= 3 else { usage() }
guard CommandLine.arguments[1] == "start" else { usage() }

let outputURL = URL(fileURLWithPath: CommandLine.arguments[2])
let audioMode = CommandLine.arguments.count >= 4 ? CommandLine.arguments[3] : "system"
guard ["system", "microphone"].contains(audioMode) else { usage() }
var screenOrigin: CGPoint? = nil
var cropRect: CGRect? = nil
var excludedBundleID: String? = nil
if CommandLine.arguments.count >= 10 {
    guard
        let screenX = Double(CommandLine.arguments[4]),
        let screenY = Double(CommandLine.arguments[5]),
        let regionX = Double(CommandLine.arguments[6]),
        let regionY = Double(CommandLine.arguments[7]),
        let regionW = Double(CommandLine.arguments[8]),
        let regionH = Double(CommandLine.arguments[9])
    else {
        usage()
    }
    screenOrigin = CGPoint(x: screenX, y: screenY)
    if regionW > 0 && regionH > 0 {
        cropRect = CGRect(x: max(0, regionX), y: max(0, regionY), width: max(2, regionW), height: max(2, regionH))
    }
    if CommandLine.arguments.count >= 11 {
        excludedBundleID = CommandLine.arguments[10]
    }
}
try? FileManager.default.createDirectory(at: outputURL.deletingLastPathComponent(), withIntermediateDirectories: true)
let recorder = NativeRecorder(outputURL: outputURL, audioMode: audioMode, screenOrigin: screenOrigin, cropRect: cropRect, excludedBundleID: excludedBundleID)

Task {
    do {
        try await recorder.start()
    } catch {
        emit(["event": "error", "message": error.localizedDescription])
        CFRunLoopStop(CFRunLoopGetMain())
    }
}

DispatchQueue.global(qos: .userInitiated).async {
    while let line = readLine() {
        if line.trimmingCharacters(in: .whitespacesAndNewlines) == "stop" {
            recorder.stop()
            break
        }
    }
}

CFRunLoopRun()
