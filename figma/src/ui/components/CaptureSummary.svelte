<svelte:options runes={true} />

<script lang="ts">
  import type { Capture } from '../../shared/capture-types';

  const { capture }: { capture: Capture } = $props();

  function countNodes(node: Capture['tree']): number {
    return 1 + node.children.reduce((n, c) => n + countNodes(c), 0);
  }

  const nodeCount = $derived(countNodes(capture.tree));
  const capturedAt = $derived(new Date(capture.capturedAt).toLocaleString());
</script>

<div class="summary">
  <div class="row"><span class="key">URL</span><span class="val url">{capture.url}</span></div>
  <div class="row"><span class="key">Title</span><span class="val">{capture.title}</span></div>
  <div class="row">
    <span class="key">Viewport</span>
    <span class="val">
      {capture.viewport.actualWidth}×{capture.viewport.actualHeight}
      {#if capture.viewport.requestedWidth !== capture.viewport.actualWidth}
        <em class="mismatch">(target: {capture.viewport.requestedWidth}px)</em>
      {/if}
    </span>
  </div>
  <div class="row"><span class="key">Nodes</span><span class="val">{nodeCount.toLocaleString()}</span></div>
  <div class="row"><span class="key">Captured</span><span class="val">{capturedAt}</span></div>
  {#if capture.warnings.length > 0}
    <div class="row"><span class="key">Warnings</span><span class="val warn">{capture.warnings.length}</span></div>
  {/if}
</div>

<style>
  .summary { display: flex; flex-direction: column; gap: 4px; font-size: 12px; }
  .row { display: flex; gap: 8px; }
  .key { color: #888; width: 64px; flex-shrink: 0; padding-top: 1px; }
  .val { color: #111; flex: 1; word-break: break-all; }
  .url { color: #18a0fb; }
  .warn { color: #f24822; font-weight: 500; }
  .mismatch { font-style: normal; color: #f24822; font-size: 11px; }
</style>
