<svelte:options runes={true} />

<script lang="ts">
  import * as T from 'teenoo';
  import type { BuildWarning } from '../../shared/messages';

  const { warnings }: { warnings: BuildWarning[] } = $props();
  let expanded = $state(false);
</script>

{#if warnings.length > 0}
  <div class="wrap">
    <button class="toggle" onclick={() => (expanded = !expanded)}>
      <T.Text small strong color="var(--figma-color-text-danger)">{warnings.length} warning{warnings.length === 1 ? '' : 's'}</T.Text>
      <T.Text small color="var(--figma-color-text-secondary)">{expanded ? '▲' : '▼'}</T.Text>
    </button>
    {#if expanded}
      <ul class="list">
        {#each warnings as w}
          <li>
            {#if w.nodeId}
              <button class="warning-link" onclick={() => parent.postMessage({ pluginMessage: { type: 'select-node', nodeId: w.nodeId } }, '*')}>
                <T.Text small color="var(--figma-color-text)">{w.message}</T.Text>
              </button>
            {:else}
              <T.Text small color="var(--figma-color-text)">{w.message}</T.Text>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </div>
{/if}

<style lang="scss">
  .wrap { 
    display: flex; 
    flex-direction: column; 
    gap: 4px; 
    margin-bottom: var(--8px);
  }
  .toggle {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: var(--figma-color-bg-danger-tertiary);
    border: 1px solid var(--figma-color-border-danger);
    border-radius: 6px;
    padding: 6px 10px;
    cursor: pointer;
    width: 100%;
  }
  .list {
    margin: 0;
    padding: var(--20px);
    display: flex;
    flex-direction: column;
    gap: var(--12px);
    background: transparent;
    border: 1px solid var(--figma-color-border-danger);
    border-radius: 6px;
    margin-bottom: calc(73px);
    color: var(--figma-color-text);

    li {
      list-style-type: none;
    }
    .warning-link {
      all: unset;
      cursor: pointer;
      &:hover { text-decoration: underline; }
    }
  }
</style>
