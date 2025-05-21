<script lang="ts">
  import { onMount } from 'svelte';
  import QRCode from 'qrcode';

  export let value: string;
  let canvas: HTMLCanvasElement;

  async function renderQR() {
    if (canvas && value) {
      await QRCode.toCanvas(canvas, value, { width: 240 });
    }
  }

  onMount(renderQR);
</script>

<canvas class="qr-code" bind:this={canvas}></canvas>
