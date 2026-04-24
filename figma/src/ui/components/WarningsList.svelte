<svelte:options runes={true} />

<script lang="ts">
  import type { BuildWarning } from '../../shared/messages';

  const { warnings }: { warnings: BuildWarning[] } = $props();
  let expanded = $state(false);
</script>

{#if warnings.length > 0}
  <div class="wrap">
    <button class="toggle" onclick={() => (expanded = !expanded)}>
      {warnings.length} warning{warnings.length === 1 ? '' : 's'}
      <span class="arrow">{expanded ? '▲' : '▼'}</span>
    </button>
    {#if expanded}
      <ul class="list">
        {#each warnings as w}
          <li class="item" class:info={w.level === 'info'} class:warning={w.level === 'warning'}>
            {w.message}
          </li>
        {/each}
      </ul>
    {/if}
  </div>
{/if}

<style>
  .wrap   { display: flex; flex-direction: column; gap: 4px; }
  .toggle { display: flex; justify-content: space-between; align-items: center;
            font-size: 12px; font-weight: 500; color: #f24822; background: #fff3f0;
            border: 1px solid #ffd4cc; border-radius: 4px; padding: 5px 8px;
            cursor: pointer; width: 100%; }
  .arrow  { font-size: 9px; }
  .list   { margin: 0; padding: 0 0 0 12px; display: flex; flex-direction: column; gap: 3px; }
  .item   { font-size: 11px; line-height: 1.4; }
  .info   { color: #555; }
  .warning{ color: #c44; }
</style>
