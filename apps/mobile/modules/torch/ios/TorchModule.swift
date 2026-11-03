import AVFoundation
import ExpoModulesCore

// Lampe du téléphone sans ouvrir la caméra.
public class TorchModule: Module {
  public func definition() -> ModuleDefinition {
    Name("Torch")

    Function("isAvailable") { () -> Bool in
      AVCaptureDevice.default(for: .video)?.hasTorch ?? false
    }

    AsyncFunction("setEnabled") { (on: Bool) throws in
      guard let device = AVCaptureDevice.default(for: .video), device.hasTorch else {
        throw NSError(domain: "Torch", code: 1, userInfo: [NSLocalizedDescriptionKey: "Pas de lampe sur ce téléphone."])
      }
      try device.lockForConfiguration()
      device.torchMode = on ? .on : .off
      device.unlockForConfiguration()
    }
  }
}
