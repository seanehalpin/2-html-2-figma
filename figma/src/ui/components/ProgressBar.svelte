<svelte:options runes={true} />

<script lang="ts">
  import * as T from 'teenoo';
  const { current, total, phase }: { current: number; total: number; phase: string } = $props();
  const pct = $derived(total > 0 ? Math.round((current / total) * 100) : 0);
</script>

<div class="wrap">
  <T.Text small strong>{phase}</T.Text>
  <div class="bar">
    <div class="fill" style="width: {pct}%"></div>
  </div>
  <T.Text small color="var(--figma-color-text-secondary)">{current.toLocaleString()} / {total.toLocaleString()} nodes ({pct}%)</T.Text>
</div>

<style>
  .wrap { display: flex; flex-direction: column; gap: 6px; }
  .bar  { height: 4px; background: var(--figma-color-border); border-radius: 2px; overflow: hidden; }
  .fill { height: 100%; background: var(--figma-color-bg-brand); border-radius: 2px; transition: width 0.1s; }
</style>
