import AppKit

private final class FlippedTestContentView: NSView {
    override var isFlipped: Bool { true }
}

private final class RecordingDragWindow: NSWindow {
    private(set) var performedDragCount = 0

    override func performDrag(with event: NSEvent) {
        performedDragCount += 1
    }
}

@main
struct PresenterHostTest {
    @MainActor
    static func main() {
        let fileManager = FileManager.default
        let originalDirectory = fileManager.currentDirectoryPath
        let staticFixture = fileManager.temporaryDirectory
            .appendingPathComponent("OpenFXStaticRouteTest-\(UUID().uuidString)", isDirectory: true)
        let staticWebRoot = staticFixture.appendingPathComponent(".openfx-web", isDirectory: true)
        let hlcRoot = staticWebRoot.appendingPathComponent("hlc", isDirectory: true)
        try! fileManager.createDirectory(at: hlcRoot, withIntermediateDirectories: true)
        try! Data("OPENFX ROOT INDEX".utf8).write(
            to: staticWebRoot.appendingPathComponent("index.html")
        )
        try! Data("HLC DIRECTORY INDEX".utf8).write(
            to: hlcRoot.appendingPathComponent("index.html")
        )
        precondition(fileManager.changeCurrentDirectoryPath(staticFixture.path))
        precondition(openfxNativePhotosServerStart(15_502) == 0)
        let directoryResponse = try! Data(
            contentsOf: URL(string: "http://127.0.0.1:15502/hlc/")!
        )
        let directoryHTML = String(decoding: directoryResponse, as: UTF8.self)
        precondition(fileManager.changeCurrentDirectoryPath(originalDirectory))
        try? fileManager.removeItem(at: staticFixture)
        precondition(directoryHTML == "HLC DIRECTORY INDEX")

        let appWindow = RecordingDragWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1180, height: 788),
            styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        appWindow.setFrame(NSRect(x: 0, y: 0, width: 1180, height: 820), display: false)
        guard let appContentView = appWindow.contentView,
              let appFrameView = appContentView.superview
        else {
            preconditionFailure("测试窗口缺少内容视图")
        }
        appContentView.frame = appWindow.contentLayoutRect
        appContentView.translatesAutoresizingMaskIntoConstraints = false
        precondition(appContentView.frame.height < appFrameView.bounds.height)

        configureOpenFXWindowChrome(appWindow)
        precondition(appWindow.styleMask.contains(.fullSizeContentView))
        precondition(appWindow.titleVisibility == .hidden)
        precondition(appWindow.titlebarAppearsTransparent)
        precondition(appWindow.titlebarSeparatorStyle == .none)
        precondition(appWindow.isMovableByWindowBackground)
        precondition(appContentView.frame == appFrameView.bounds)
        precondition(appContentView.translatesAutoresizingMaskIntoConstraints)
        guard let titlebarView = appWindow.standardWindowButton(.closeButton)?.superview,
              let dragRegion = titlebarView.subviews.first(where: {
            $0.identifier == openFXWindowDragRegionIdentifier
        }) else {
            preconditionFailure("测试窗口缺少透明拖拽区")
        }
        precondition(dragRegion.superview === titlebarView)
        precondition(dragRegion is OpenFXWindowDragRegion)
        precondition(dragRegion.mouseDownCanMoveWindow)
        precondition(dragRegion.frame.minX == 72)
        precondition(dragRegion.frame.maxX == titlebarView.bounds.maxX)
        precondition(dragRegion.frame.minY == titlebarView.bounds.minY)
        precondition(dragRegion.frame.height == titlebarView.bounds.height)
        let mouseDown = NSEvent.mouseEvent(
            with: .leftMouseDown,
            location: NSPoint(x: dragRegion.frame.midX, y: dragRegion.frame.midY),
            modifierFlags: [],
            timestamp: 0,
            windowNumber: appWindow.windowNumber,
            context: nil,
            eventNumber: 1,
            clickCount: 1,
            pressure: 1
        )
        precondition(mouseDown != nil)
        dragRegion.mouseDown(with: mouseDown!)
        precondition(appWindow.performedDragCount == 1)

        appWindow.setFrame(NSRect(x: 0, y: 0, width: 1260, height: 900), display: false)
        precondition(appContentView.frame == appFrameView.bounds)
        precondition(dragRegion.frame.minX == 72)
        precondition(dragRegion.frame.maxX == titlebarView.bounds.maxX)
        precondition(dragRegion.frame.minY == titlebarView.bounds.minY)
        precondition(dragRegion.frame.height == titlebarView.bounds.height)

        let flippedContentView = FlippedTestContentView(
            frame: NSRect(x: 0, y: 0, width: 900, height: 640)
        )
        let flippedWindow = NSWindow(
            contentRect: flippedContentView.frame,
            styleMask: [.titled, .resizable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        flippedWindow.contentView = flippedContentView
        configureOpenFXWindowChrome(flippedWindow)
        guard let flippedTitlebarView = flippedWindow.standardWindowButton(.closeButton)?.superview,
              let flippedDragRegion = flippedTitlebarView.subviews.first(where: {
            $0.identifier == openFXWindowDragRegionIdentifier
        }) else {
            preconditionFailure("翻转坐标内容视图缺少透明拖拽区")
        }
        precondition(flippedDragRegion.superview === flippedTitlebarView)
        precondition(flippedDragRegion.frame.minY == flippedTitlebarView.bounds.minY)
        precondition(flippedDragRegion.frame.height == flippedTitlebarView.bounds.height)

        let stillRoute = parseNativeResourceRoute(
            "/__openfx_native__/resources/9dbbd5de-450a-4ec5-bfb4-ef0b30ab0dc6/still"
        )
        precondition(stillRoute?.token == "9dbbd5de-450a-4ec5-bfb4-ef0b30ab0dc6")
        precondition(stillRoute?.kind == "still")
        precondition(parseNativeResourceRoute(
            "/__openfx_native__/resources/9dbbd5de-450a-4ec5-bfb4-ef0b30ab0dc6/motion"
        )?.kind == "motion")
        precondition(parseNativeResourceRoute(
            "/__openfx_native__/resources/9dbbd5de-450a-4ec5-bfb4-ef0b30ab0dc6"
        ) == nil)

        let contentView = NSView(frame: NSRect(x: 0, y: 0, width: 800, height: 600))
        let window = NSWindow(
            contentRect: contentView.frame,
            styleMask: [.titled],
            backing: .buffered,
            defer: false
        )
        window.contentView = contentView

        precondition(!window.isVisible)
        precondition(selectPresentationWindow(
            keyWindow: nil,
            mainWindow: nil,
            windows: [window]
        ) === window)
        window.makeKeyAndOrderFront(nil)
        precondition(window.isVisible)

        let picker = NSViewController()
        picker.view = NSView(frame: NSRect(x: 0, y: 0, width: 960, height: 720))
        let pickerWindow = NativePickerWindowHost(
            parentWindow: window,
            contentViewController: picker
        )

        precondition(window.childWindows?.contains(where: { $0 === pickerWindow.window }) == true)
        precondition(pickerWindow.window.isVisible)
        precondition(pickerWindow.window.contentViewController === picker)
        precondition(pickerWindow.window.contentLayoutRect.width >= 900)
        precondition(pickerWindow.window.contentLayoutRect.height >= 650)

        pickerWindow.dismiss()
        precondition(window.childWindows?.contains(where: { $0 === pickerWindow.window }) != true)
        precondition(!pickerWindow.window.isVisible)

        let standalonePicker = NSViewController()
        standalonePicker.view = NSView(frame: NSRect(x: 0, y: 0, width: 960, height: 720))
        let standaloneWindow = NativePickerWindowHost(
            parentWindow: nil,
            contentViewController: standalonePicker
        )
        precondition(standaloneWindow.window.isVisible)
        precondition(standaloneWindow.window.contentViewController === standalonePicker)
        standaloneWindow.dismiss()
        precondition(!standaloneWindow.window.isVisible)
    }
}
