import Foundation

/// A scripted run for the simulator check in CI (SFILM_SMOKE=text): no camera there, so an
/// imported picture stands in, then text is added, typed, styled and set behind the subject
/// while the picture renders. Does nothing unless the variable is set.
extension AppModel {
    func smokeTestIfAsked() {
        guard let what = ProcessInfo.processInfo.environment["SFILM_SMOKE"] else { return }
        say("SMOKE start \(what)")
        guard let url = Bundle.main.url(forResource: "fx_provia", withExtension: "jpg", subdirectory: "looks") else {
            say("SMOKE no picture"); return
        }
        imported(url, video: false)
        var steps: [(Double, String, () -> Void)] = [
            (1.0, "open text tray", { self.dock = .TEXT }),
            (2.0, "add text", { self.addText() }),
            (3.0, "type", {
                guard var l = self.selectedLayer else { say("SMOKE no layer"); return }
                l.text = "Summer '26"
                self.replaceText(l)
                self.editingText = false
            }),
            (4.0, "animate", { if var l = self.selectedLayer { l.anim = .WIGGLE; l.fx = .GLOW; self.replaceText(l) } }),
            (12.0, "behind", { if var l = self.selectedLayer { l.behind = true; self.replaceText(l) } }),
            (14.0, "second text", { self.addText(); self.editingText = false }),
            (15.0, "save", { self.shutter() }),
        ]
        for (i, t) in TextTool.allCases.enumerated() {
            steps.append((5.0 + Double(i) * 0.6, "tool \(t.rawValue)", { self.textTool = t }))
        }
        for (t, name, step) in steps {
            DispatchQueue.main.asyncAfter(deadline: .now() + t) {
                say("SMOKE step \(name)")
                step()
            }
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 20) { say("SMOKE OK") }
    }
}

private func say(_ s: String) {
    print(s)
    fflush(stdout)
}
