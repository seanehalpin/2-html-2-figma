<svelte:options runes={true} />

<script lang="ts">
  import styles from './styles.module.css';
  import type { Capture } from '../content/types';

  type CaptureState =
    | { status: 'idle' }
    | { status: 'capturing' }
    | { status: 'done'; capture: Capture }
    | { status: 'error'; message: string };

  let captureState = $state<CaptureState>({ status: 'idle' });

  function countNodes(node: Capture['tree']): number {
    let n = 1;
    for (const child of node.children) n += countNodes(child);
    return n;
  }

  let nodeCount = $derived.by(() => {
    if (captureState.status !== 'done') return 0;
    return countNodes(captureState.capture.tree);
  });

  let payloadKb = $derived.by(() => {
    if (captureState.status !== 'done') return '0';
    return (JSON.stringify(captureState.capture).length / 1024).toFixed(1);
  });

  let warningCount = $derived.by(() => {
    if (captureState.status !== 'done') return 0;
    return captureState.capture.warnings.length;
  });

  async function capture() {
    captureState = { status: 'capturing' };
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'capture-request',
      });

      if (response?.type === 'capture-response') {
        captureState = { status: 'done', capture: response.payload as Capture };
      } else if (response?.type === 'capture-error') {
        captureState = { status: 'error', message: response.error as string };
      } else {
        captureState = { status: 'error', message: 'Unexpected response from extension' };
      }
    } catch (err) {
      captureState = {
        status: 'error',
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }

  function downloadJson() {
    if (captureState.status !== 'done') return;
    const json = JSON.stringify(captureState.capture, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const ts = captureState.capture.capturedAt.replace(/[:.]/g, '-');
    a.download = `dom-capture-${ts}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function copyToClipboard() {
    if (captureState.status !== 'done') return;
    await navigator.clipboard.writeText(JSON.stringify(captureState.capture, null, 2));
  }
</script>

<main class={styles.container}>
  <h1 class={styles.title}>DOM Extractor</h1>

  <button
    class={styles.captureBtn}
    onclick={capture}
    disabled={captureState.status === 'capturing'}
  >
    {captureState.status === 'capturing' ? 'Capturing…' : 'Capture page'}
  </button>

  {#if captureState.status === 'done'}
    <div class={styles.meta}>
      <span>{nodeCount.toLocaleString()} nodes</span>
      <span>{payloadKb} KB</span>
      {#if warningCount > 0}
        <span class={styles.warn}>
          {warningCount} warning{warningCount === 1 ? '' : 's'}
        </span>
      {/if}
    </div>

    <div class={styles.actions}>
      <button class={styles.actionBtn} onclick={downloadJson}>Download JSON</button>
      <button class={styles.actionBtn} onclick={copyToClipboard}>Copy to clipboard</button>
    </div>
  {/if}

  {#if captureState.status === 'error'}
    <p class={styles.error}>{captureState.message}</p>
  {/if}
</main>
