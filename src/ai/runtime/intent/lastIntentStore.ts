let lastIntentJson: string | null = null;

export function setLastIntentJson(obj: unknown): void {
  try {
    lastIntentJson = JSON.stringify(obj, null, 2);
  } catch {
    lastIntentJson = null;
  }
}

export function getLastIntentJson(): string | null {
  return lastIntentJson;
}

/** Clears in-memory intent snapshot (e.g. Start fresh session). */
export function clearLastIntentStore(): void {
  lastIntentJson = null;
}
