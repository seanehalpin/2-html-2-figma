<svelte:options runes={true} />

<script lang="ts">
  import type { Capture } from '../shared/capture-types';
  import type { PluginToUI, BuildResult } from '../shared/messages';
  import DropZone from './components/DropZone.svelte';
  import CaptureSummary from './components/CaptureSummary.svelte';
  import ProgressBar from './components/ProgressBar.svelte';
  import WarningsList from './components/WarningsList.svelte';
  import styles from './styles.module.css';

  type Phase =
    | { name: 'idle' }
    | { name: 'error'; message: string }
    | { name: 'loaded'; capture: Capture }
    | { name: 'building'; current: number; total: number; phase: string }
    | { name: 'done'; result: BuildResult };

  let state = $state<Phase>({ name: 'idle' });
  let simplify = $state(true);

  // Validate that a parsed JSON object has the required Capture shape.
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

  async function rasterizeSvg(node: Capture['tree']): Promise<[string, number[]] | null> {
    if (!node.svgData) return null;
    const { width, height } = node.rect;
    if (width <= 0 || height <= 0) return null;
    try {
      const blob = new Blob([node.svgData], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = reject;
        i.src = url;
      });
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(width * 2);
      canvas.height = Math.ceil(height * 2);
      const ctx = canvas.getContext('2d')!;
      ctx.scale(2, 2);
      ctx.drawImage(img, 0, 0, width, height);
      const pngBlob = await new Promise<Blob>((resolve) => canvas.toBlob(b => resolve(b!), 'image/png'));
      const bytes = Array.from(new Uint8Array(await pngBlob.arrayBuffer()));
      return [node.id, bytes];
    } catch {
      return null;
    }
  }

  async function collectSvgImages(tree: Capture['tree']): Promise<Record<string, number[]>> {
    const svgNodes: Capture['tree'][] = [];
    function walk(n: Capture['tree']) {
      if (n.svgData !== undefined) svgNodes.push(n);
      for (const c of n.children) walk(c);
    }
    walk(tree);
    const results = await Promise.all(svgNodes.map(rasterizeSvg));
    const out: Record<string, number[]> = {};
    for (const r of results) { if (r) out[r[0]] = r[1]; }
    return out;
  }

  async function build() {
    if (state.name !== 'loaded') return;
    const capture = $state.snapshot(state.capture) as Capture;
    state = { name: 'building', current: 0, total: 1, phase: 'Rasterizing SVGs' };
    const svgImages = await collectSvgImages(capture.tree);
    state = { name: 'building', current: 0, total: 1, phase: 'Loading fonts' };
    parent.postMessage({ pluginMessage: { type: 'build-request', capture, simplify, svgImages } }, '*');
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

<main class={styles.container}>
  <h1 class={styles.title}>Yoink</h1>

  {#if state.name === 'idle'}
    <DropZone {onFile} />

  {:else if state.name === 'error'}
    <div class={styles.errorBox}>
      <strong>Error</strong>
      <p>{state.message}</p>
    </div>
    <button class={styles.secondaryBtn} onclick={() => (state = { name: 'idle' })}>Try again</button>

  {:else if state.name === 'loaded'}
    <CaptureSummary capture={state.capture} />
    <label class={styles.checkRow}>
      <input type="checkbox" bind:checked={simplify} />
      <span>Simplify structure <small>(collapse wrapper-only nodes)</small></span>
    </label>
    <div class={styles.actions}>
      <button class={styles.primaryBtn} onclick={build}>Create frame</button>
      <button class={styles.secondaryBtn} onclick={() => (state = { name: 'idle' })}>Change file</button>
    </div>

  {:else if state.name === 'building'}
    <ProgressBar current={state.current} total={state.total} phase={state.phase} />

  {:else if state.name === 'done'}
    {@const r = state.result}
    <div class={styles.doneGrid}>
      <div class={styles.stat}><span class={styles.statVal}>{r.nodesCreated.toLocaleString()}</span><span class={styles.statKey}>nodes created</span></div>
      <div class={styles.stat}><span class={styles.statVal}>{r.nodesCollapsed.toLocaleString()}</span><span class={styles.statKey}>collapsed</span></div>
      <div class={styles.stat}><span class={styles.statVal}>{r.warnings.length}</span><span class={styles.statKey}>warnings</span></div>
      <div class={styles.stat}><span class={styles.statVal}>{r.missingFonts.length}</span><span class={styles.statKey}>font subs</span></div>
    </div>
    {#if r.missingFonts.length > 0}
      <div class={styles.missingFonts}>
        <strong>Font substitutions (→ Inter Regular)</strong>
        <ul>
          {#each r.missingFonts as f}<li>{f.family} {f.style}</li>{/each}
        </ul>
      </div>
    {/if}
    <WarningsList warnings={r.warnings} />
    <button class={styles.secondaryBtn} onclick={() => (state = { name: 'idle' })}>Import another</button>
  {/if}
</main>

<style>
  :global(*, *::before, *::after) { box-sizing: border-box; margin: 0; padding: 0; }
  :global(body) { font-family: system-ui, -apple-system, sans-serif; font-size: 12px; }
</style>
