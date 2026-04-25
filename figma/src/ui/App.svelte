<svelte:options runes={true} />

<script lang="ts">
  import * as T from 'teenoo';
  import type { Capture } from '../shared/capture-types';
  import type { PluginToUI, BuildResult } from '../shared/messages';
  import DropZone from './components/DropZone.svelte';
  import CaptureSummary from './components/CaptureSummary.svelte';
  import ProgressBar from './components/ProgressBar.svelte';
  import WarningsList from './components/WarningsList.svelte';

  type Phase =
    | { name: 'idle' }
    | { name: 'error'; message: string }
    | { name: 'loaded'; capture: Capture }
    | { name: 'building'; current: number; total: number; phase: string }
    | { name: 'done'; result: BuildResult };

  let state = $state<Phase>({ name: 'idle' });
  let simplify = $state(true);
  let iconMode = $state<'stroke' | 'fill'>('stroke');

  function validate(obj: unknown): Capture {
    if (!obj || typeof obj !== 'object') throw new Error('Not a valid JSON object');
    const c = obj as Record<string, unknown>;
    if (!c.tree)     throw new Error('Missing field: tree');
    if (!c.viewport) throw new Error('Missing field: viewport');
    if (!c.url)      throw new Error('Missing field: url');
    if (!c.capturedAt) throw new Error('Missing field: capturedAt');
    const vp = c.viewport as Record<string, unknown>;
    if (typeof vp.actualWidth !== 'number')  throw new Error('viewport.actualWidth must be a number');
    if (typeof vp.actualHeight !== 'number') throw new Error('viewport.actualHeight must be a number');
    const tree = c.tree as Record<string, unknown>;
    if (typeof tree.tag !== 'string')        throw new Error('tree.tag must be a string');
    if (!Array.isArray(tree.children))       throw new Error('tree.children must be an array');
    if (!tree.rect)                          throw new Error('tree.rect is missing');
    return obj as Capture;
  }

  async function onFile(file: File) {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const capture = validate(parsed);
      state = { name: 'loaded', capture };
    } catch (err) {
      state = { name: 'error', message: err instanceof Error ? err.message : String(err) };
    }
  }

  function build() {
    if (state.name !== 'loaded') return;
    const capture = $state.snapshot(state.capture) as Capture;
    state = { name: 'building', current: 0, total: 1, phase: 'Loading fonts' };
    parent.postMessage({ pluginMessage: { type: 'build-request', capture, simplify, iconMode } }, '*');
  }

  window.addEventListener('message', (event: MessageEvent) => {
    const msg = event.data?.pluginMessage as PluginToUI | undefined;
    if (!msg) return;

    if (msg.type === 'progress') {
      state = { name: 'building', current: msg.current, total: msg.total, phase: msg.phase };
    } else if (msg.type === 'build-complete') {
      state = { name: 'done', result: msg.result };
    } else if (msg.type === 'build-error') {
      state = { name: 'error', message: msg.error };
    }
  });
</script>

  <!-- <T.Autolayout vertical gap="12px" padding="16px" fillWidth> -->

    {#if state.name === 'idle'}
      <DropZone {onFile} />

    {:else if state.name === 'error'}
      <div class="error-box">
        <T.Text small strong color="var(--figma-color-text-danger)">Error</T.Text>
        <T.Text small color="var(--figma-color-text)">{state.message}</T.Text>
      </div>
      <T.Button variant="secondary" stretch onclick={() => (state = { name: 'idle' })}>Try again</T.Button>

    {:else if state.name === 'loaded'}
      <CaptureSummary capture={state.capture} />
      <!-- <T.Checkbox bind:checked={simplify} label="Simplify structure" /> -->
      <div class="tabs-row">
        <T.Text small color="var(--figma-color-text-secondary)">SVG icon color</T.Text>
        <T.Tabs tabs={[{ id: 'stroke', label: 'Stroke' }, { id: 'fill', label: 'Fill' }]} bind:activeTab={iconMode} />
      </div>
      <div class="footer">
        <T.Button stretch onclick={build}>Create</T.Button>
        <T.Button variant="secondary" stretch onclick={() => (state = { name: 'idle' })}>Change file</T.Button>
      </div>

    {:else if state.name === 'building'}
      <ProgressBar current={state.current} total={state.total} phase={state.phase} />

    {:else if state.name === 'done'}
      {@const r = state.result}
      <div class="stat-grid">
        <div class="stat">
          <T.Text jumbo>{r.nodesCreated.toLocaleString()}</T.Text>
          <T.Text small color="var(--figma-color-text-secondary)">nodes created</T.Text>
        </div>
        <div class="stat">
          <T.Text jumbo>{r.nodesCollapsed.toLocaleString()}</T.Text>
          <T.Text small color="var(--figma-color-text-secondary)">collapsed</T.Text>
        </div>
        <div class="stat">
          <T.Text jumbo>{r.warnings.length}</T.Text>
          <T.Text small color="var(--figma-color-text-secondary)">warnings</T.Text>
        </div>
        <div class="stat">
          <T.Text jumbo>{r.missingFonts.length}</T.Text>
          <T.Text small color="var(--figma-color-text-secondary)">font subs</T.Text>
        </div>
      </div>
      {#if r.missingFonts.length > 0}
        <div class="missing-fonts">
          <T.Text small strong color="var(--figma-color-text-warning)">Font substitutions → Inter Regular</T.Text>
          <ul>
            {#each r.missingFonts as f}
              <li><T.Text small>{f.family} {f.style}</T.Text></li>
            {/each}
          </ul>
        </div>
      {/if}
      <WarningsList warnings={r.warnings} />
      <div class="footer">
        <T.Button variant="secondary" stretch onclick={() => (state = { name: 'idle' })}>Import another</T.Button>
      </div>
    {/if}
  <!-- </T.Autolayout> -->


<style lang="scss">

  .footer {
    position: fixed;
    bottom: 0;
    left: 0;
    width: 100%;
    z-index: 100;
    padding: var(--20px);
    display: flex;
    flex-direction: column;
    gap: var(--8px);
    background: var(--figma-color-bg);
    border-top: 1px solid var(--figma-color-border);
  }
  
  .error-box {
    background: var(--figma-color-bg-danger-tertiary);
    border: 1px solid var(--figma-color-border-danger);
    border-radius: 6px;
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .tabs-row {
    display: flex;
    flex-direction: column;
    gap: var(--8px);
    padding: 0 0 var(--20px);
  }

  .stat-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap:  var(--8px);
    margin-bottom: var(--8px);
  }
  .stat {
    background: var(--figma-color-bg-secondary);
    border: 1px solid var(--figma-color-border);
    border-radius: 6px;
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .missing-fonts {
    background: var(--figma-color-bg-warning-tertiary);
    border: 1px solid var(--figma-color-border-warning);
    border-radius: 6px;
    padding: 8px 10px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-bottom: var(--8px);
  }
  .missing-fonts ul {
    padding-left: 14px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
</style>
