<svelte:options runes={true} />

<script lang="ts">
  import * as T from 'teenoo';
  import type { Capture } from '../../shared/capture-types';

  const { capture }: { capture: Capture } = $props();

  function countNodes(node: Capture['tree']): number {
    return 1 + node.children.reduce((n, c) => n + countNodes(c), 0);
  }

  const nodeCount = $derived(countNodes(capture.tree));
  const capturedAt = $derived(new Date(capture.capturedAt).toLocaleString());
</script>

<div class="summary-holder">
<div class="summary">
  {#each [
    // { key: 'URL', val: capture.url, url: true },
    { key: 'Title', val: capture.title ?? '—' },
    { key: 'Viewport', val: `${capture.viewport.actualWidth}×${capture.viewport.actualHeight}` },
    { key: 'Nodes', val: nodeCount.toLocaleString() },
    { key: 'Captured', val: capturedAt },
  ] as row}
    <div class="row">
      <T.Text small color="var(--figma-color-text-tertiary)" className="key">{row.key}</T.Text>
      <T.Text small color="var(--figma-color-text)" className="val">{row.val}</T.Text>
    </div>
  {/each}
  <!-- {#if capture.warnings.length > 0}
    <div class="row">
      <T.Text small color="var(--figma-color-text-tertiary)" className="key">Warnings</T.Text>
      <T.Text small color="var(--figma-color-text-danger)" strong>{capture.warnings.length}</T.Text>
    </div>
  {/if} -->
</div>
</div>

<style lang="scss">

  .summary-holder {
    padding: 0 0 var(--20px);
    display: flex; 
    flex-direction: column; 
    gap: var(--20px);
  }
  
  .summary {
    border: 1px solid var(--figma-color-border);
    padding: var(--20px);
    display: flex; 
    flex-direction: column; 
    gap: var(--20px);
    border-radius: var(--8px);
  }

  .row { 
    display: flex; 
    gap: 8px; 
    align-items: flex-start; 
  }

  :global(.key) { 
    width: 64px; flex-shrink: 0; 
  }
  :global(.val) { 
    flex: 1; 
    word-break: break-all; 
  }

</style>
