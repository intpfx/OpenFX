import AppKit
import Foundation
import Network
import Photos
import PhotosUI
import UniformTypeIdentifiers

private let nativeProtocol = "openfx-native-photos-v1"
private let nativeSessionHeader = "x-openfx-native-session"

private struct NativeResourceDescriptor: Codable {
    let url: String
    let name: String
    let type: String
    let lastModified: Int64
}

private struct NativeImportResponse: Codable {
    let resources: [NativeResourceDescriptor]
}

private struct NativeImportRecord {
    let directory: URL
    let stillURL: URL
    let motionURL: URL
    let stillName: String
    let motionName: String
    let stillType: String
    let motionType: String
}

private struct NativeImportDraft {
    let directory: URL
    let stillURL: URL
    let motionURL: URL
    let stillName: String
    let motionName: String
    let stillType: String
    let motionType: String
}

private struct HTTPRequest {
    let method: String
    let path: String
    let headers: [String: String]
}

struct NativeResourceRoute: Equatable {
    let token: String
    let kind: String
}

func parseNativeResourceRoute(_ path: String) -> NativeResourceRoute? {
    let parts = path.split(separator: "/").map(String.init)
    guard parts.count == 4,
          parts[0] == "__openfx_native__",
          parts[1] == "resources",
          !parts[2].isEmpty,
          parts[3] == "still" || parts[3] == "motion"
    else {
        return nil
    }
    return NativeResourceRoute(token: parts[2], kind: parts[3])
}

private enum NativeBridgeError: LocalizedError {
    case missingResource(String)
    case noWebAssets

    var errorDescription: String? {
        switch self {
        case .missingResource(let message): return message
        case .noWebAssets: return "找不到 OpenFX Web 资源"
        }
    }
}

func selectPresentationWindow(
    keyWindow: NSWindow?,
    mainWindow: NSWindow?,
    windows: [NSWindow]
) -> NSWindow? {
    if let keyWindow, keyWindow.sheetParent == nil { return keyWindow }
    if let mainWindow, mainWindow.sheetParent == nil { return mainWindow }
    let rootWindows = windows.filter { $0.sheetParent == nil }
    return rootWindows.first(where: { $0.isVisible }) ??
        rootWindows.first(where: { $0.contentView != nil }) ??
        rootWindows.first
}

let openFXWindowDragRegionIdentifier = NSUserInterfaceItemIdentifier(
    "OpenFXWindowDragRegion"
)

final class OpenFXWindowDragRegion: NSView {
    override var mouseDownCanMoveWindow: Bool { true }

    override func mouseDown(with event: NSEvent) {
        window?.performDrag(with: event)
    }
}

func configureOpenFXWindowChrome(_ window: NSWindow) {
    window.styleMask.insert(.fullSizeContentView)
    window.titleVisibility = .hidden
    window.titlebarAppearsTransparent = true
    window.titlebarSeparatorStyle = .none
    window.isMovableByWindowBackground = true
    if let contentView = window.contentView,
       let frameView = contentView.superview {
        let layoutConstraints = frameView.constraints.filter { constraint in
            (constraint.firstItem as? NSView) === contentView ||
                (constraint.secondItem as? NSView) === contentView
        }
        NSLayoutConstraint.deactivate(layoutConstraints)
        contentView.translatesAutoresizingMaskIntoConstraints = true
        contentView.autoresizingMask = [.width, .height]
        contentView.frame = frameView.bounds

        guard let dragHost = window.standardWindowButton(.closeButton)?.superview else {
            return
        }
        let dragRegion = dragHost.subviews.first(where: {
            $0.identifier == openFXWindowDragRegionIdentifier
        }) ?? OpenFXWindowDragRegion(frame: .zero)
        dragRegion.identifier = openFXWindowDragRegionIdentifier
        dragRegion.autoresizingMask = [.width, .height]
        dragRegion.frame = NSRect(
            x: 72,
            y: dragHost.bounds.minY,
            width: max(0, dragHost.bounds.width - 72),
            height: dragHost.bounds.height
        )
        dragRegion.removeFromSuperview()
        dragHost.addSubview(dragRegion)
    }
}

private final class OpenFXWindowChromeInstaller {
    private var remainingAttempts = 0

    func installWhenReady() {
        remainingAttempts = 80
        DispatchQueue.main.async { [weak self] in
            self?.installIfPossible()
        }
    }

    private func installIfPossible() {
        let application = NSApplication.shared
        let rootWindows = application.windows.filter { $0.sheetParent == nil }
        if let window = rootWindows.first(where: { $0.title == "OpenFX" }) ??
            rootWindows.first(where: { $0.isVisible && $0.contentView != nil }) {
            let activeDragRegion = window.standardWindowButton(.closeButton)?
                .superview?.subviews.last
            if activeDragRegion?.identifier != openFXWindowDragRegionIdentifier {
                configureOpenFXWindowChrome(window)
            }
        }
        guard remainingAttempts > 0 else { return }
        remainingAttempts -= 1
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) { [weak self] in
            self?.installIfPossible()
        }
    }
}

final class NativePickerWindowHost {
    let window: NSWindow
    private weak var parentWindow: NSWindow?

    init(parentWindow: NSWindow?, contentViewController: NSViewController) {
        let contentSize = NSSize(width: 960, height: 720)
        contentViewController.preferredContentSize = contentSize

        let pickerWindow = NSWindow(
            contentRect: NSRect(origin: .zero, size: contentSize),
            styleMask: [.titled, .resizable],
            backing: .buffered,
            defer: false
        )
        pickerWindow.title = "选择实况照片"
        pickerWindow.contentViewController = contentViewController
        pickerWindow.isReleasedWhenClosed = false
        pickerWindow.minSize = NSSize(width: 720, height: 540)

        if let parentWindow {
            let parentFrame = parentWindow.frame
            let origin = NSPoint(
                x: parentFrame.midX - contentSize.width / 2,
                y: parentFrame.midY - contentSize.height / 2
            )
            pickerWindow.setFrameOrigin(origin)
        } else {
            pickerWindow.center()
        }
        pickerWindow.level = .modalPanel

        self.window = pickerWindow
        self.parentWindow = parentWindow
        parentWindow?.addChildWindow(pickerWindow, ordered: .above)
        pickerWindow.makeKeyAndOrderFront(nil)
    }

    func dismiss() {
        if let parentWindow,
           parentWindow.childWindows?.contains(where: { $0 === window }) == true {
            parentWindow.removeChildWindow(window)
        }
        window.orderOut(nil)
    }
}

private final class LivePhotoPickerCoordinator: NSObject, PHPickerViewControllerDelegate {
    private let completion: (Result<NativeImportDraft?, Error>) -> Void
    private var completed = false
    private var pickerWindowHost: NativePickerWindowHost?

    init(completion: @escaping (Result<NativeImportDraft?, Error>) -> Void) {
        self.completion = completion
    }

    func present() throws {
        NSApplication.shared.activate(ignoringOtherApps: true)
        let status = PHPhotoLibrary.authorizationStatus(for: .readWrite)
        if status == .notDetermined {
            PHPhotoLibrary.requestAuthorization(for: .readWrite) { [weak self] next in
                DispatchQueue.main.async {
                    self?.presentAfterAuthorization(next)
                }
            }
            return
        }
        presentAfterAuthorization(status)
    }

    private func presentAfterAuthorization(_ status: PHAuthorizationStatus) {
        guard status == .authorized || status == .limited else {
            finish(.failure(NativeBridgeError.missingResource(
                "需要 Photos 读取权限才能导出实况照片的原始资源"
            )))
            return
        }
        presentPicker()
    }

    private func presentPicker() {
        guard !completed else { return }
        let application = NSApplication.shared
        let parentWindow = selectPresentationWindow(
            keyWindow: application.keyWindow,
            mainWindow: application.mainWindow,
            windows: application.windows
        )
        application.activate(ignoringOtherApps: true)
        parentWindow?.makeKeyAndOrderFront(nil)

        var configuration = PHPickerConfiguration(photoLibrary: PHPhotoLibrary.shared())
        configuration.filter = .livePhotos
        configuration.selectionLimit = 1
        configuration.preferredAssetRepresentationMode = .current
        let picker = PHPickerViewController(configuration: configuration)
        picker.delegate = self
        pickerWindowHost = NativePickerWindowHost(
            parentWindow: parentWindow,
            contentViewController: picker
        )
    }

    func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
        dismissPicker()
        guard let result = results.first else {
            finish(.success(nil))
            return
        }

        guard let identifier = result.assetIdentifier,
              let asset = PHAsset.fetchAssets(
                withLocalIdentifiers: [identifier],
                options: nil
              ).firstObject
        else {
            finish(.failure(NativeBridgeError.missingResource(
                "Photos 没有返回所选实况照片的资源标识"
            )))
            return
        }
        export(asset)
    }

    private func export(_ asset: PHAsset) {
        let resources = PHAssetResource.assetResources(for: asset)
        let still = resources.first(where: { $0.type == .photo }) ??
            resources.first(where: { $0.type == .fullSizePhoto })
        let motion = resources.first(where: { $0.type == .pairedVideo }) ??
            resources.first(where: { $0.type == .fullSizePairedVideo })
        guard let still, let motion else {
            finish(.failure(NativeBridgeError.missingResource(
                "Photos 没有返回完整的静态帧和动态片段"
            )))
            return
        }

        do {
            let directory = try makeImportDirectory()
            let stillName = safeFilename(still.originalFilename, fallback: "LivePhoto.HEIC")
            let stillStem = URL(fileURLWithPath: stillName).deletingPathExtension().lastPathComponent
            let motionOriginal = safeFilename(motion.originalFilename, fallback: "LivePhoto.mov")
            let motionExtension = URL(fileURLWithPath: motionOriginal).pathExtension.isEmpty
                ? "mov"
                : URL(fileURLWithPath: motionOriginal).pathExtension
            let motionName = "\(stillStem).\(motionExtension)"
            let stillURL = directory.appendingPathComponent(stillName)
            let motionURL = directory.appendingPathComponent(motionName)
            let options = PHAssetResourceRequestOptions()
            options.isNetworkAccessAllowed = true

            PHAssetResourceManager.default().writeData(
                for: still,
                toFile: stillURL,
                options: options
            ) { [weak self] error in
                guard let self else { return }
                if let error {
                    self.finish(.failure(error))
                    return
                }
                PHAssetResourceManager.default().writeData(
                    for: motion,
                    toFile: motionURL,
                    options: options
                ) { [weak self] error in
                    guard let self else { return }
                    if let error {
                        self.finish(.failure(error))
                        return
                    }
                    self.finish(.success(NativeImportDraft(
                        directory: directory,
                        stillURL: stillURL,
                        motionURL: motionURL,
                        stillName: stillName,
                        motionName: motionName,
                        stillType: mimeType(for: still, fallback: "image/heic"),
                        motionType: mimeType(for: motion, fallback: "video/quicktime")
                    )))
                }
            }
        } catch {
            finish(.failure(error))
        }
    }

    private func finish(_ result: Result<NativeImportDraft?, Error>) {
        DispatchQueue.main.async { [weak self] in
            guard let self, !self.completed else { return }
            self.completed = true
            self.dismissPicker()
            self.completion(result)
        }
    }

    private func dismissPicker() {
        pickerWindowHost?.dismiss()
        pickerWindowHost = nil
    }
}

private final class OpenFXNativeServer {
    static let shared = OpenFXNativeServer()

    private let queue = DispatchQueue(label: "com.siaovon.openfx.native-http")
    private let encoder = JSONEncoder()
    private let sessionToken = UUID().uuidString.replacingOccurrences(of: "-", with: "")
    private var imports: [String: NativeImportRecord] = [:]
    private var listener: NWListener?
    private var pickerActive = false
    private var pickerCoordinator: LivePhotoPickerCoordinator?
    private var webRoot: URL?
    private let windowChromeInstaller = OpenFXWindowChromeInstaller()

    func start(port rawPort: Int32) -> Int32 {
        guard listener == nil, let root = resolveWebRoot() else { return -1 }
        guard let port = NWEndpoint.Port(rawValue: UInt16(rawPort)) else { return -2 }

        do {
            let parameters = NWParameters.tcp
            parameters.requiredLocalEndpoint = .hostPort(host: "127.0.0.1", port: port)
            let listener = try NWListener(using: parameters)
            let semaphore = DispatchSemaphore(value: 0)
            let stateLock = NSLock()
            var result: Int32 = -3
            var resolved = false
            listener.stateUpdateHandler = { state in
                stateLock.lock()
                defer { stateLock.unlock() }
                guard !resolved else { return }
                switch state {
                case .ready:
                    resolved = true
                    result = 0
                    semaphore.signal()
                case .failed:
                    resolved = true
                    result = -3
                    semaphore.signal()
                default:
                    break
                }
            }
            listener.newConnectionHandler = { [weak self] connection in
                self?.accept(connection)
            }
            self.webRoot = root
            self.listener = listener
            cleanupImportCache()
            listener.start(queue: queue)
            if semaphore.wait(timeout: .now() + 3) == .timedOut {
                listener.cancel()
                self.listener = nil
                return -3
            }
            if result != 0 {
                listener.cancel()
                self.listener = nil
            } else {
                windowChromeInstaller.installWhenReady()
            }
            return result
        } catch {
            return -3
        }
    }

    private func accept(_ connection: NWConnection) {
        connection.stateUpdateHandler = { state in
            if case .failed = state { connection.cancel() }
        }
        connection.start(queue: queue)
        receiveRequest(connection, buffer: Data())
    }

    private func receiveRequest(_ connection: NWConnection, buffer: Data) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 16_384) {
            [weak self] data, _, complete, error in
            guard let self else { return }
            if error != nil {
                connection.cancel()
                return
            }
            var next = buffer
            if let data { next.append(data) }
            if next.count > 65_536 {
                self.sendJSON(connection, status: 413, value: ["error": "request_too_large"])
                return
            }
            if let range = next.range(of: Data("\r\n\r\n".utf8)) {
                let headerData = next[..<range.lowerBound]
                guard let request = self.parseRequest(Data(headerData)) else {
                    self.sendJSON(connection, status: 400, value: ["error": "bad_request"])
                    return
                }
                self.route(request, connection: connection)
                return
            }
            if complete {
                self.sendJSON(connection, status: 400, value: ["error": "bad_request"])
            } else {
                self.receiveRequest(connection, buffer: next)
            }
        }
    }

    private func parseRequest(_ data: Data) -> HTTPRequest? {
        guard let text = String(data: data, encoding: .utf8) else { return nil }
        let lines = text.components(separatedBy: "\r\n")
        let requestLine = lines.first?.split(separator: " ") ?? []
        guard requestLine.count >= 2 else { return nil }
        var headers: [String: String] = [:]
        for line in lines.dropFirst() {
            guard let separator = line.firstIndex(of: ":") else { continue }
            let key = line[..<separator].trimmingCharacters(in: .whitespaces).lowercased()
            let value = line[line.index(after: separator)...].trimmingCharacters(in: .whitespaces)
            headers[key] = value
        }
        return HTTPRequest(
            method: String(requestLine[0]).uppercased(),
            path: String(requestLine[1]),
            headers: headers
        )
    }

    private func route(_ request: HTTPRequest, connection: NWConnection) {
        let path = request.path.split(separator: "?", maxSplits: 1).first.map(String.init) ?? "/"
        if request.method == "GET" && path == "/__openfx_native__/capabilities" {
            sendJSON(connection, status: 200, value: [
                "protocol": nativeProtocol,
                "platform": "macos",
                "sessionToken": sessionToken,
            ])
            return
        }

        if path.hasPrefix("/__openfx_native__/") &&
            request.headers[nativeSessionHeader] != sessionToken {
            sendJSON(connection, status: 403, value: ["error": "forbidden"])
            return
        }

        if request.method == "POST" && path == "/__openfx_native__/live-photo" {
            beginLivePhotoSelection(connection)
            return
        }

        if request.method == "GET" && path.hasPrefix("/__openfx_native__/resources/") {
            serveNativeResource(path, connection: connection)
            return
        }

        if request.method == "GET" || request.method == "HEAD" {
            serveStatic(path, headOnly: request.method == "HEAD", connection: connection)
            return
        }
        sendJSON(connection, status: 405, value: ["error": "method_not_allowed"])
    }

    private func beginLivePhotoSelection(_ connection: NWConnection) {
        guard !pickerActive else {
            sendJSON(connection, status: 409, value: ["error": "picker_busy"])
            return
        }
        pickerActive = true
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            let coordinator = LivePhotoPickerCoordinator { [weak self] result in
                guard let self else { return }
                self.queue.async {
                    self.pickerActive = false
                    self.pickerCoordinator = nil
                    switch result {
                    case .success(nil):
                        self.sendEmpty(connection, status: 204)
                    case .success(let draft?):
                        self.register(draft, connection: connection)
                    case .failure(let error):
                        self.sendJSON(connection, status: 500, value: [
                            "error": "photos_export_failed",
                            "message": error.localizedDescription,
                        ])
                    }
                }
            }
            self.pickerCoordinator = coordinator
            do {
                try coordinator.present()
            } catch {
                self.queue.async {
                    self.pickerActive = false
                    self.pickerCoordinator = nil
                    self.sendJSON(connection, status: 500, value: [
                        "error": "photos_picker_failed",
                        "message": error.localizedDescription,
                    ])
                }
            }
        }
    }

    private func register(_ draft: NativeImportDraft, connection: NWConnection) {
        let token = UUID().uuidString.lowercased()
        imports[token] = NativeImportRecord(
            directory: draft.directory,
            stillURL: draft.stillURL,
            motionURL: draft.motionURL,
            stillName: draft.stillName,
            motionName: draft.motionName,
            stillType: draft.stillType,
            motionType: draft.motionType
        )
        let now = Int64(Date().timeIntervalSince1970 * 1000)
        let response = NativeImportResponse(resources: [
            NativeResourceDescriptor(
                url: "/__openfx_native__/resources/\(token)/still",
                name: draft.stillName,
                type: draft.stillType,
                lastModified: now
            ),
            NativeResourceDescriptor(
                url: "/__openfx_native__/resources/\(token)/motion",
                name: draft.motionName,
                type: draft.motionType,
                lastModified: now
            ),
        ])
        sendEncodable(connection, status: 200, value: response)
    }

    private func serveNativeResource(_ path: String, connection: NWConnection) {
        guard let route = parseNativeResourceRoute(path),
              let record = imports[route.token]
        else {
            sendJSON(connection, status: 404, value: ["error": "resource_not_found"])
            return
        }
        switch route.kind {
        case "still":
            sendFile(connection, url: record.stillURL, contentType: record.stillType)
        case "motion":
            sendFile(connection, url: record.motionURL, contentType: record.motionType)
        default:
            sendJSON(connection, status: 404, value: ["error": "resource_not_found"])
        }
    }

    private func serveStatic(_ rawPath: String, headOnly: Bool, connection: NWConnection) {
        guard let root = webRoot else {
            sendJSON(connection, status: 500, value: ["error": "web_root_unavailable"])
            return
        }
        let decoded = rawPath.removingPercentEncoding ?? rawPath
        guard !decoded.split(separator: "/").contains("..") else {
            sendJSON(connection, status: 400, value: ["error": "invalid_path"])
            return
        }
        let relative = decoded == "/" ? "index.html" : String(decoded.dropFirst())
        var candidate = root.appendingPathComponent(relative).standardizedFileURL
        let rootPath = root.standardizedFileURL.path + "/"
        guard candidate.path.hasPrefix(rootPath) else {
            sendJSON(connection, status: 400, value: ["error": "invalid_path"])
            return
        }
        var isDirectory: ObjCBool = false
        let candidateExists = FileManager.default.fileExists(
            atPath: candidate.path,
            isDirectory: &isDirectory
        )
        if candidateExists && isDirectory.boolValue {
            let directoryIndex = candidate.appendingPathComponent("index.html")
            var directoryIndexIsDirectory: ObjCBool = false
            if FileManager.default.fileExists(
                atPath: directoryIndex.path,
                isDirectory: &directoryIndexIsDirectory
            ) && !directoryIndexIsDirectory.boolValue {
                candidate = directoryIndex
            } else if URL(fileURLWithPath: relative).pathExtension.isEmpty {
                candidate = root.appendingPathComponent("index.html")
            } else {
                sendJSON(connection, status: 404, value: ["error": "not_found"])
                return
            }
        } else if !candidateExists {
            if URL(fileURLWithPath: relative).pathExtension.isEmpty {
                candidate = root.appendingPathComponent("index.html")
            } else {
                sendJSON(connection, status: 404, value: ["error": "not_found"])
                return
            }
        }
        sendFile(
            connection,
            url: candidate,
            contentType: staticMimeType(for: candidate),
            headOnly: headOnly
        )
    }

    private func sendEncodable<T: Encodable>(
        _ connection: NWConnection,
        status: Int,
        value: T
    ) {
        do {
            sendData(connection, status: status, contentType: "application/json; charset=utf-8", data: try encoder.encode(value))
        } catch {
            sendJSON(connection, status: 500, value: ["error": "encoding_failed"])
        }
    }

    private func sendJSON(
        _ connection: NWConnection,
        status: Int,
        value: [String: String]
    ) {
        let data = (try? JSONSerialization.data(withJSONObject: value)) ?? Data("{}".utf8)
        sendData(connection, status: status, contentType: "application/json; charset=utf-8", data: data)
    }

    private func sendData(
        _ connection: NWConnection,
        status: Int,
        contentType: String,
        data: Data
    ) {
        let headers = responseHeaders(status: status, contentType: contentType, length: UInt64(data.count))
        connection.send(content: Data(headers.utf8), completion: .contentProcessed { error in
            if error != nil {
                connection.cancel()
                return
            }
            connection.send(content: data, isComplete: true, completion: .contentProcessed { _ in
                connection.cancel()
            })
        })
    }

    private func sendEmpty(_ connection: NWConnection, status: Int) {
        let headers = responseHeaders(status: status, contentType: nil, length: 0)
        connection.send(content: Data(headers.utf8), isComplete: true, completion: .contentProcessed { _ in
            connection.cancel()
        })
    }

    private func sendFile(
        _ connection: NWConnection,
        url: URL,
        contentType: String,
        headOnly: Bool = false
    ) {
        do {
            let attributes = try FileManager.default.attributesOfItem(atPath: url.path)
            let length = (attributes[.size] as? NSNumber)?.uint64Value ?? 0
            let headers = responseHeaders(status: 200, contentType: contentType, length: length)
            if headOnly {
                connection.send(content: Data(headers.utf8), isComplete: true, completion: .contentProcessed { _ in
                    connection.cancel()
                })
                return
            }
            let handle = try FileHandle(forReadingFrom: url)
            connection.send(content: Data(headers.utf8), completion: .contentProcessed { [weak self] error in
                guard let self, error == nil else {
                    try? handle.close()
                    connection.cancel()
                    return
                }
                self.sendNextChunk(connection, handle: handle)
            })
        } catch {
            sendJSON(connection, status: 404, value: ["error": "not_found"])
        }
    }

    private func sendNextChunk(_ connection: NWConnection, handle: FileHandle) {
        do {
            let data = try handle.read(upToCount: 256 * 1024) ?? Data()
            if data.isEmpty {
                try handle.close()
                connection.send(content: nil, isComplete: true, completion: .contentProcessed { _ in
                    connection.cancel()
                })
                return
            }
            connection.send(content: data, completion: .contentProcessed { [weak self] error in
                guard let self, error == nil else {
                    try? handle.close()
                    connection.cancel()
                    return
                }
                self.sendNextChunk(connection, handle: handle)
            })
        } catch {
            try? handle.close()
            connection.cancel()
        }
    }

    private func responseHeaders(
        status: Int,
        contentType: String?,
        length: UInt64
    ) -> String {
        let reason: String
        switch status {
        case 200: reason = "OK"
        case 204: reason = "No Content"
        case 400: reason = "Bad Request"
        case 403: reason = "Forbidden"
        case 404: reason = "Not Found"
        case 405: reason = "Method Not Allowed"
        case 409: reason = "Conflict"
        case 413: reason = "Payload Too Large"
        default: reason = "Internal Server Error"
        }
        var headers = "HTTP/1.1 \(status) \(reason)\r\n"
        if let contentType { headers += "Content-Type: \(contentType)\r\n" }
        headers += "Content-Length: \(length)\r\n"
        headers += "Cache-Control: no-store\r\n"
        headers += "X-Content-Type-Options: nosniff\r\n"
        headers += "Connection: close\r\n\r\n"
        return headers
    }

    private func resolveWebRoot() -> URL? {
        let fileManager = FileManager.default
        var candidates: [URL] = [
            URL(fileURLWithPath: fileManager.currentDirectoryPath)
                .appendingPathComponent(".openfx-web"),
        ]
        if let resourceURL = Bundle.main.resourceURL {
            candidates.append(resourceURL.appendingPathComponent("NativeLibraries/openfx-native-photos/.openfx-web"))
            candidates.append(resourceURL.appendingPathComponent("NativeLibraries/openfx-native-photos"))
            candidates.append(resourceURL.appendingPathComponent(".openfx-web"))
        }
        if let executableURL = Bundle.main.executableURL {
            let directory = executableURL.deletingLastPathComponent()
            candidates.append(directory.appendingPathComponent("NativeLibraries/openfx-native-photos/.openfx-web"))
            candidates.append(directory.appendingPathComponent(".openfx-web"))
        }
        return candidates.first(where: {
            fileManager.fileExists(atPath: $0.appendingPathComponent("index.html").path)
        })?.standardizedFileURL
    }

    private func cleanupImportCache() {
        let root = importCacheRoot()
        try? FileManager.default.removeItem(at: root)
        try? FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        imports.removeAll()
    }
}

private func importCacheRoot() -> URL {
    let base = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first ??
        FileManager.default.temporaryDirectory
    return base.appendingPathComponent("OpenFX/NativePhotos", isDirectory: true)
}

private func makeImportDirectory() throws -> URL {
    let directory = importCacheRoot().appendingPathComponent(UUID().uuidString, isDirectory: true)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    return directory
}

private func safeFilename(_ name: String, fallback: String) -> String {
    let candidate = URL(fileURLWithPath: name).lastPathComponent
        .replacingOccurrences(of: "/", with: "-")
        .replacingOccurrences(of: "\\", with: "-")
    return candidate.isEmpty ? fallback : candidate
}

private func mimeType(for resource: PHAssetResource, fallback: String) -> String {
    UTType(resource.uniformTypeIdentifier)?.preferredMIMEType ?? fallback
}

private func staticMimeType(for url: URL) -> String {
    switch url.pathExtension.lowercased() {
    case "html": return "text/html; charset=utf-8"
    case "css": return "text/css; charset=utf-8"
    case "js", "mjs": return "text/javascript; charset=utf-8"
    case "json", "webmanifest": return "application/json; charset=utf-8"
    case "svg": return "image/svg+xml"
    case "png": return "image/png"
    case "jpg", "jpeg": return "image/jpeg"
    case "webp": return "image/webp"
    case "ico": return "image/x-icon"
    case "wasm": return "application/wasm"
    case "mp4": return "video/mp4"
    case "mov": return "video/quicktime"
    case "woff2": return "font/woff2"
    default: return "application/octet-stream"
    }
}

@_cdecl("openfx_native_photos_server_start")
public func openfxNativePhotosServerStart(_ port: Int32) -> Int32 {
    OpenFXNativeServer.shared.start(port: port)
}
