import SwiftUI

// Placeholder: replaced by the gallery and viewer.
struct GalleryScreen: View {
    @EnvironmentObject var model: AppModel
    var body: some View { Button("Back") { model.closeGallery() } }
}

struct ViewerScreen: View {
    @EnvironmentObject var model: AppModel
    var body: some View { Button("Back") { model.closeViewer() } }
}
