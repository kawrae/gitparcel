export const maxBundleBytes = 512 * 1024 ** 2;
export const maxQueueEntries = 65_535;
export const maxQueueMetadataBytes = 32 * 1024 ** 2;

export const discoveryLimits = Object.freeze({
  requests: 24,
  bytes: 8 * 1024 ** 2,
  entries: 10_000,
});
