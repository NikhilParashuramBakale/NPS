/** Shared tuning for admin_local / viewer_local JPEG upload + polling (~15–25 FPS). */
export const LOCAL_CAMERA_MAX_WIDTH = 640;
export const LOCAL_CAMERA_MAX_HEIGHT = 360;
export const LOCAL_CAMERA_JPEG_QUALITY = 0.55;  // Reduced from 0.68 for faster uploads
export const LOCAL_CAMERA_UPLOAD_INTERVAL_MS = 100;
export const LOCAL_CAMERA_POLL_INTERVAL_MS = 100;
export const LOCAL_CAMERA_POLL_INTERVAL_MISS_MS = 80;
export const LOCAL_CAMERA_POLL_INTERVAL_IDLE_MS = 150;

export const scaleLocalCameraDimensions = (videoWidth: number, videoHeight: number) => {
  const vw = videoWidth || LOCAL_CAMERA_MAX_WIDTH;
  const vh = videoHeight || LOCAL_CAMERA_MAX_HEIGHT;
  const scale = Math.min(1, LOCAL_CAMERA_MAX_WIDTH / vw, LOCAL_CAMERA_MAX_HEIGHT / vh);
  return {
    width: Math.max(160, Math.floor(vw * scale)),
    height: Math.max(90, Math.floor(vh * scale)),
  };
};