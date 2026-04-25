import { extract } from './extract';

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'capture-request') return false;

  extract().then(
    payload => sendResponse({ type: 'capture-response', payload }),
    err => sendResponse({ type: 'capture-error', error: err instanceof Error ? err.message : String(err) }),
  );

  return true; // keep channel open for async response
});
