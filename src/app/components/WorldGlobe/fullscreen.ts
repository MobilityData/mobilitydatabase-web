type FullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

type FullscreenDocument = Document & {
  webkitExitFullscreen?: () => Promise<void> | void;
};

export function requestFullscreenForElement(element: HTMLElement | null): void {
  if (!element) return;
  const el = element as FullscreenElement;
  if (el.requestFullscreen) {
    void el.requestFullscreen();
    return;
  }
  void el.webkitRequestFullscreen?.();
}

export function exitFullscreenDocument(): void {
  const doc = document as FullscreenDocument;
  if (document.exitFullscreen) {
    void document.exitFullscreen();
    return;
  }
  void doc.webkitExitFullscreen?.();
}
