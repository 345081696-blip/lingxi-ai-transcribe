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
    private var isStopping = false

    init(outputURL: URL) {
        self.outputURL = outputURL
    }

    func start() async throws {
        let content = try await SCShareableContent.current
        guard let display = content.displays.first else {
            throw NSError(domain: "NativeRecorder", code: 1, userInfo: [NSLocalizedDescriptionKey: "没有找到可录制的屏幕。"])
        }

        let filter = SCContentFilter(display: display, excludingWindows: [])
        let config = SCStreamConfiguration()
        config.width = Int(display.width)
        config.height = Int(display.height)
        config.minimumFrameInterval = CMTime(value: 1, timescale: 30)
        config.pixelFormat = kCVPixelFormatType_32BGRA
        config.showsCursor = true
        config.queueDepth = 8
        config.capturesAudio = true
        config.excludesCurrentProcessAudio = true
        config.sampleRate = 48_000
        config.channelCount = 2

        let recordingConfig = SCRecordingOutputConfiguration()
        recordingConfig.outputURL = outputURL
        recordingConfig.outputFileType = .mp4
        recordingConfig.videoCodecType = .h264

        let delegate = RecorderDelegate(
            onStart: { emit(["event": "started", "filePath": self.outputURL.path]) },
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
        emit(["event": "captureStarted", "filePath": outputURL.path])
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
    fputs("Usage: native-recorder start <output.mp4>\n", stderr)
    exit(2)
}

guard CommandLine.arguments.count >= 3 else { usage() }
guard CommandLine.arguments[1] == "start" else { usage() }

let outputURL = URL(fileURLWithPath: CommandLine.arguments[2])
try? FileManager.default.createDirectory(at: outputURL.deletingLastPathComponent(), withIntermediateDirectories: true)
let recorder = NativeRecorder(outputURL: outputURL)

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
