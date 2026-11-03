package expo.modules.torch

import android.content.Context
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraManager
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// Lampe du téléphone sans ouvrir la caméra : CameraManager.setTorchMode ne demande aucune permission.
class TorchModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("Torch")

    Function("isAvailable") { flashId() != null }

    AsyncFunction("setEnabled") { on: Boolean ->
      val id = flashId() ?: throw CodedException("Pas de lampe sur ce téléphone.")
      manager()?.setTorchMode(id, on)
    }
  }

  private fun manager() = appContext.reactContext?.getSystemService(Context.CAMERA_SERVICE) as? CameraManager

  private fun flashId(): String? = try {
    val m = manager()
    m?.cameraIdList?.firstOrNull { m.getCameraCharacteristics(it).get(CameraCharacteristics.FLASH_INFO_AVAILABLE) == true }
  } catch (e: Exception) {
    null
  }
}
