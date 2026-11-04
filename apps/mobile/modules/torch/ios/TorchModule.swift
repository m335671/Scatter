import AVFoundation
import ExpoModulesCore

// Lampe du téléphone sans ouvrir la caméra.
public class TorchModule: Module {
  public func definition() -> ModuleDefinition {
    Name("Torch")

    Function("isAvailable") { () -> Bool in
      AVCaptureDevice.default(for: .video)?.hasTorch ?? false
    }

    // L'iPhone règle la luminosité en continu : 100 niveaux suffisent pour la barre.
    Function("maxLevel") { () -> Int in
      (AVCaptureDevice.default(for: .video)?.hasTorch ?? false) ? 100 : 0
    }

    AsyncFunction("setEnabled") { (on: Bool) throws in
      let device = try Self.torch()
      try device.lockForConfiguration()
      device.torchMode = on ? .on : .off
      device.unlockForConfiguration()
    }

    // level : de 0 (éteinte) à 1 (pleine puissance).
    AsyncFunction("setLevel") { (level: Double) throws in
      let device = try Self.torch()
      try device.lockForConfiguration()
      defer { device.unlockForConfiguration() }
      if level <= 0 {
        device.torchMode = .off
      } else {
        try device.setTorchModeOn(level: Float(min(level, 1)))
      }
    }
  }

  private static func torch() throws -> AVCaptureDevice {
    guard let device = AVCaptureDevice.default(for: .video), device.hasTorch else {
      throw NSError(domain: "Torch", code: 1, userInfo: [NSLocalizedDescriptionKey: "Pas de lampe sur ce téléphone."])
    }
    return device
  }
}
