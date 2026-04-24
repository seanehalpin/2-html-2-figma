<svelte:options runes={true} />

<script lang="ts">
  const { current, total, phase }: { current: number; total: number; phase: string } = $props();
  const pct = $derived(total > 0 ? Math.round((current / total) * 100) : 0);
</script>

<div class="wrap">
  <div class="phase">{phase}</div>
  <div class="bar">
    <div class="fill" style="width: {pct}%"></div>
  </div>
  <div class="nums">{current.toLocaleString()} / {total.toLocaleString()} nodes ({pct}%)</div>
</div>

<style>
  .wrap  { display: flex; flex-direction: column; gap: 6px; }
  .phase { font-size: 12px; color: #555; font-weight: 500; }
  .bar   { height: 6px; background: #eee; border-radius: 3px; overflow: hidden; }
  .fill  { height: 100%; background: #18a0fb; border-radius: 3px; transition: width 0.1s; }
  .nums  { font-size: 11px; color: #888; }
</style>
