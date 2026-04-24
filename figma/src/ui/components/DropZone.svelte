<svelte:options runes={true} />

<script lang="ts">
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
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
    <path d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M8 12l4-4 4 4M12 8v8" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>
  <p class="label">Drop <code>.json</code> capture here</p>
  <p class="sub">or click to browse</p>
  <input bind:this={inputRef} type="file" accept=".json,application/json" onchange={handleChange} />
</div>

<style>
  .zone {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    border: 1.5px dashed #ccc;
    border-radius: 8px;
    padding: 28px 16px;
    cursor: pointer;
    color: #888;
    transition: border-color 0.15s, color 0.15s, background 0.15s;
    user-select: none;
  }
  .zone:hover, .zone.dragging {
    border-color: #18a0fb;
    color: #18a0fb;
    background: #f0f8ff;
  }
  .label { margin: 0; font-size: 13px; font-weight: 500; }
  .sub   { margin: 0; font-size: 11px; }
  input  { display: none; }
  svg    { opacity: 0.7; }
</style>
