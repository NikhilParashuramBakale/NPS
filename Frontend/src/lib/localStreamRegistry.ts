/** Shares active local webcam MediaStreams so publisher previews can mirror without polling. */
const streams = new Map<number, MediaStream>();
const listeners = new Map<number, Set<() => void>>();

const notify = (cameraId: number) => {
  listeners.get(cameraId)?.forEach((cb) => cb());
};

export const registerLocalStream = (cameraId: number, stream: MediaStream) => {
  streams.set(cameraId, stream);
  notify(cameraId);
};

export const unregisterLocalStream = (cameraId: number) => {
  streams.delete(cameraId);
  notify(cameraId);
};

export const getLocalStream = (cameraId: number) => streams.get(cameraId);

export const subscribeLocalStream = (cameraId: number, listener: () => void) => {
  const set = listeners.get(cameraId) ?? new Set();
  set.add(listener);
  listeners.set(cameraId, set);
  return () => {
    set.delete(listener);
    if (set.size === 0) listeners.delete(cameraId);
  };
};
