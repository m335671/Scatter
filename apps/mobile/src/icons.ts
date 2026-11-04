// Icônes Phosphor, importées une par une : depuis 'phosphor-react-native', Metro embarquerait les 1 512 icônes
// (bundle 10,9 Mo → 4,7 Mo). require : le typecheck ne descend pas dans les sources .tsx du paquet.
// Nouvelle icône : une ligne de plus ici, nom du fichier = nom sans « Icon » (voir node_modules/phosphor-react-native/src/icons).
/* eslint-disable @typescript-eslint/no-require-imports */
import type { Icon } from 'phosphor-react-native';

export const ArrowRightIcon: Icon = require('phosphor-react-native/src/icons/ArrowRight').ArrowRightIcon;
export const BatteryChargingIcon: Icon = require('phosphor-react-native/src/icons/BatteryCharging').BatteryChargingIcon;
export const BellIcon: Icon = require('phosphor-react-native/src/icons/Bell').BellIcon;
export const BroadcastIcon: Icon = require('phosphor-react-native/src/icons/Broadcast').BroadcastIcon;
export const CameraIcon: Icon = require('phosphor-react-native/src/icons/Camera').CameraIcon;
export const CaretDownIcon: Icon = require('phosphor-react-native/src/icons/CaretDown').CaretDownIcon;
export const CaretLeftIcon: Icon = require('phosphor-react-native/src/icons/CaretLeft').CaretLeftIcon;
export const CaretRightIcon: Icon = require('phosphor-react-native/src/icons/CaretRight').CaretRightIcon;
export const CheckIcon: Icon = require('phosphor-react-native/src/icons/Check').CheckIcon;
export const CopyIcon: Icon = require('phosphor-react-native/src/icons/Copy').CopyIcon;
export const CrosshairIcon: Icon = require('phosphor-react-native/src/icons/Crosshair').CrosshairIcon;
export const DeviceMobileIcon: Icon = require('phosphor-react-native/src/icons/DeviceMobile').DeviceMobileIcon;
export const DotsThreeIcon: Icon = require('phosphor-react-native/src/icons/DotsThree').DotsThreeIcon;
export const FlashlightIcon: Icon = require('phosphor-react-native/src/icons/Flashlight').FlashlightIcon;
export const MapPinIcon: Icon = require('phosphor-react-native/src/icons/MapPin').MapPinIcon;
export const MapTrifoldIcon: Icon = require('phosphor-react-native/src/icons/MapTrifold').MapTrifoldIcon;
export const NavigationArrowIcon: Icon = require('phosphor-react-native/src/icons/NavigationArrow').NavigationArrowIcon;
export const PaperPlaneRightIcon: Icon = require('phosphor-react-native/src/icons/PaperPlaneRight').PaperPlaneRightIcon;
export const PathIcon: Icon = require('phosphor-react-native/src/icons/Path').PathIcon;
export const QrCodeIcon: Icon = require('phosphor-react-native/src/icons/QrCode').QrCodeIcon;
export const ScanIcon: Icon = require('phosphor-react-native/src/icons/Scan').ScanIcon;
export const SunIcon: Icon = require('phosphor-react-native/src/icons/Sun').SunIcon;
export const TargetIcon: Icon = require('phosphor-react-native/src/icons/Target').TargetIcon;
export const UserIcon: Icon = require('phosphor-react-native/src/icons/User').UserIcon;
export const XIcon: Icon = require('phosphor-react-native/src/icons/X').XIcon;
