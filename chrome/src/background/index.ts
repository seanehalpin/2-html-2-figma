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
      } catch (err) {
        throw new Error(
          `Content script unreachable. Try reloading the page. (${err instanceof Error ? err.message : String(err)})`
        );
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
