import type { UIToPlugin, PluginToUI } from '../shared/messages';
import { buildCapture } from './build';

figma.showUI(__html__, { width: 360, height: 480, title: 'DOM Extractor' });

function send(msg: PluginToUI): void {
  figma.ui.postMessage(msg);
}

figma.ui.onmessage = async (raw: UIToPlugin) => {
  if (raw.type === 'cancel') {
    figma.closePlugin();
    return;
  }

  if (raw.type !== 'build-request') return;

  try {
    const result = await buildCapture(raw.capture, {
      simplify: raw.simplify,
      onProgress(current, total, phase) {
        send({ type: 'progress', current, total, phase });
      },
    });

    send({ type: 'build-complete', result });
  } catch (err) {
    send({
      type: 'build-error',
      error: err instanceof Error ? err.message : String(err),
    });
  }
};
