import PhotosUI
import SwiftUI
import UniformTypeIdentifiers

/// The library picker: one picture or clip, copied to a temporary file for developing.
struct MediaPicker: UIViewControllerRepresentable {
    let onPick: (URL?, Bool) -> Void
    let onCancel: () -> Void

    func makeUIViewController(context: Context) -> PHPickerViewController {
        var cfg = PHPickerConfiguration(photoLibrary: .shared())
        cfg.filter = .any(of: [.images, .videos])
        cfg.selectionLimit = 1
        cfg.preferredAssetRepresentationMode = .current
        let vc = PHPickerViewController(configuration: cfg)
        vc.delegate = context.coordinator
        return vc
    }

    func updateUIViewController(_ vc: PHPickerViewController, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    final class Coordinator: NSObject, PHPickerViewControllerDelegate {
        let parent: MediaPicker
        init(_ parent: MediaPicker) { self.parent = parent }

        func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
            guard let provider = results.first?.itemProvider else { parent.onCancel(); return }
            let video = provider.hasItemConformingToTypeIdentifier(UTType.movie.identifier)
            let type = video ? UTType.movie.identifier : UTType.image.identifier
            let done = parent.onPick
            provider.loadFileRepresentation(forTypeIdentifier: type) { url, _ in
                // The file goes away when this returns: keep a copy.
                var copy: URL?
                if let url {
                    let dest = FileManager.default.temporaryDirectory.appendingPathComponent("import_\(Int(Date().timeIntervalSince1970))_" + url.lastPathComponent)
                    try? FileManager.default.removeItem(at: dest)
                    if (try? FileManager.default.copyItem(at: url, to: dest)) != nil { copy = dest }
                }
                DispatchQueue.main.async { done(copy, video) }
            }
        }
    }
}
