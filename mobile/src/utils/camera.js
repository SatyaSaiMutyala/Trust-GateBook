import { PermissionsAndroid, Platform } from 'react-native';
import { launchCamera } from 'react-native-image-picker';
import ImageResizer from '@bam.tech/react-native-image-resizer';

/**
 * Capture presets: which camera to open and the long edge to resize to before upload.
 * photo/id = visitor check-in; cover/person = post room.
 */
const PRESETS = {
  photo: { camera: 'front', maxEdge: 520 },
  id: { camera: 'back', maxEdge: 900 },
  cover: { camera: 'back', maxEdge: 1100 },
  coverBack: { camera: 'back', maxEdge: 1100 },
  person: { camera: 'front', maxEdge: 640 },
  challan: { camera: 'back', maxEdge: 1400 },
  boxes: { camera: 'back', maxEdge: 1100 },
};

/** Asks for the camera on Android (iOS prompts on first use, from NSCameraUsageDescription). */
export async function ensureCameraPermission(
  message = 'TruSentinel needs the camera to photograph visitors, ID proof and incoming post.',
) {
  if (Platform.OS !== 'android') return true;
  const result = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.CAMERA,
    {
      title: 'Camera',
      message,
      buttonPositive: 'Allow',
      buttonNegative: 'Not now',
    },
  );
  return result === PermissionsAndroid.RESULTS.GRANTED;
}

/**
 * Opens the camera and returns a resized JPEG's local URI, or null if cancelled.
 * @param {'photo' | 'id' | 'cover' | 'coverBack' | 'person' | 'challan' | 'boxes'} kind
 * @returns {Promise<string | null>}
 */
export async function captureImage(kind) {
  const preset = PRESETS[kind] ?? PRESETS.photo;
  if (!(await ensureCameraPermission())) {
    throw new Error(
      'Camera permission is off. Allow camera access for TruSentinel in Settings.',
    );
  }
  const result = await launchCamera({
    mediaType: 'photo',
    cameraType: preset.camera,
    quality: 0.7,
    saveToPhotos: false,
    includeBase64: false,
  });
  if (result.didCancel) return null;
  if (result.errorCode) {
    throw new Error(
      result.errorCode === 'camera_unavailable'
        ? 'No camera is available on this device.'
        : result.errorCode === 'permission'
        ? 'Camera permission is off. Allow camera access for TruSentinel in Settings.'
        : result.errorMessage || 'Could not open the camera.',
    );
  }
  const asset = result.assets?.[0];
  if (!asset?.uri) return null;
  const { maxEdge } = preset;
  if (
    asset.width &&
    asset.height &&
    Math.max(asset.width, asset.height) <= maxEdge
  )
    return asset.uri;
  try {
    const resized = await ImageResizer.createResizedImage(
      asset.uri,
      maxEdge,
      maxEdge,
      'JPEG',
      72,
      0,
      null,
      false,
      {
        mode: 'contain',
        onlyScaleDown: true,
      },
    );
    return resized.uri;
  } catch {
    return asset.uri; // the server resizes anyway
  }
}
