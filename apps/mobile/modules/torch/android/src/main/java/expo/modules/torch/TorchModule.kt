package expo.modules.torch

import android.content.Context
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraManager
import android.os.Build
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlin.math.roundToInt

// Lampe du téléphone sans ouvrir la caméra : CameraManager.setTorchMode ne demande aucune permission.
class TorchModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("Torch")

    Function("isAvailable") { flashId() != null }

    // Nombre de niveaux de luminosité : 1 = allumée ou éteinte seulement (avant Android 13, ou lampe non réglable).
    Function("maxLevel") { flashId()?.let { maxLevel(it) } ?: 0 }

    AsyncFunction("setEnabled") { on: Boolean ->
      manager()?.setTorchMode(id(), on)
    }

    // level : de 0 (éteinte) à 1 (pleine puissance).
    AsyncFunction("setLevel") { level: Double ->
      val id = id()
      val m = manager() ?: return@AsyncFunction
      val max = maxLevel(id)
      when {
        level <= 0 -> m.setTorchMode(id, false)
        max > 1 && Build.VERSION.SDK_INT >= 33 -> m.turnOnTorchWithStrengthLevel(id, (level * max).roundToInt().coerceIn(1, max))
        else -> m.setTorchMode(id, true)
      }
    }
  }

  private fun manager() = appContext.reactContext?.getSystemService(Context.CAMERA_SERVICE) as? CameraManager

  private fun id() = flashId() ?: throw CodedException("Pas de lampe sur ce téléphone.")

  private fun maxLevel(id: String): Int =
    if (Build.VERSION.SDK_INT >= 33) manager()?.getCameraCharacteristics(id)?.get(CameraCharacteristics.FLASH_INFO_STRENGTH_MAXIMUM_LEVEL) ?: 1 else 1

  private fun flashId(): String? = try {
    val m = manager()
    m?.cameraIdList?.firstOrNull { m.getCameraCharacteristics(it).get(CameraCharacteristics.FLASH_INFO_AVAILABLE) == true }
  } catch (e: Exception) {
    null
  }
}
