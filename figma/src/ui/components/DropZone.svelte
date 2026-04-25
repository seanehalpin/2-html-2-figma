<svelte:options runes={true} />

<script lang="ts">
  import * as T from 'teenoo';
  import IconUpload from './IconUpload.svelte';
  const { onFile }: { onFile: (file: File) => void } = $props();

  let dragging = $state(false);
  let inputRef: HTMLInputElement;

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    dragging = false;
    const file = e.dataTransfer?.files[0];
    if (file) onFile(file);
  }

  function handleChange(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) onFile(file);
  }
</script>

<div class="box">
  <div
    class="zone"
    class:dragging
    role="button"
    tabindex="0"
    aria-label="Drop capture JSON here or click to browse"
    ondragover={(e) => { e.preventDefault(); dragging = true; }}
    ondragleave={() => { dragging = false; }}
    ondrop={handleDrop}
    onclick={() => inputRef.click()}
    onkeydown={(e) => e.key === 'Enter' && inputRef.click()}
  >
    <div class="icon">
      <IconUpload />
    </div>
    <T.Text regular strong>Drop JSON capture here</T.Text>
    <T.Text small>or click to browse</T.Text>
    <input bind:this={inputRef} type="file" accept=".json,application/json" onchange={handleChange} />
  </div>
</div>



<style lang="scss">

  .box {
    position: relative;
  }

  .zone {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    border: 1px dashed var(--figma-color-border);
    border-radius: 8px;
    padding: 28px 16px;
    cursor: pointer;
    height: calc(100vh - 40px);
    color: var(--figma-color-text);
    transition: border-color 0.15s, color 0.15s, background 0.15s;
    user-select: none;
  }
  .zone:hover, .zone.dragging {
    border-color: var(--figma-color-bg-brand);
    color: var(--figma-color-bg-brand);
    background: var(--figma-color-bg-brand-tertiary);
  }
  input { display: none; }
  code {
    font-family: var(--font-mono, monospace);
    font-size: 11px;
  }
</style>
