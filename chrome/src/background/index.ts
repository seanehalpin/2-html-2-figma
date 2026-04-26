import type { CapturePayload, Capture } from '../content/types';

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'capture-request') return false;

  void (async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) throw new Error('No active tab found');

      // Forward capture request to the content script.
      let contentResponse: { type: string; payload?: CapturePayload; error?: string };
      try {
        contentResponse = await chrome.tabs.sendMessage(tab.id, message);
      } catch {
        // Usually means the page was loaded before the extension was installed/updated,
        // or the page navigated away — a reload re-injects the content script.
        sendResponse({
          type: 'capture-error',
          error: "This page hasn't loaded the extension yet. Refresh the page and try again.",
          code: 'content-script-unreachable',
        });
        return;
      }

      if (contentResponse.type === 'capture-error') {
        sendResponse({ type: 'capture-error', error: contentResponse.error ?? 'Unknown error' });
        return;
      }

      if (contentResponse.type !== 'capture-response' || !contentResponse.payload) {
        sendResponse({ type: 'capture-error', error: 'Unexpected response from content script' });
        return;
      }

      // Screenshot must be captured here — captureVisibleTab is only accessible
      // from the service worker, not the content script.
      const screenshot = await chrome.tabs.captureVisibleTab({ format: 'png' });

      const payload: Capture = { ...contentResponse.payload, screenshot };
      sendResponse({ type: 'capture-response', payload });
    } catch (err) {
      sendResponse({
        type: 'capture-error',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  })();

  return true; // async response
});
