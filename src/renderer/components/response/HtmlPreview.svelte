<script lang="ts">
  interface Props {
    body: string
  }

  let { body }: Props = $props()

  let iframeEl = $state<HTMLIFrameElement | null>(null)

  $effect(() => {
    if (iframeEl && body) {
      const doc = iframeEl.contentDocument
      if (doc) {
        doc.open()
        doc.write(body)
        doc.close()
      }
    }
  })
</script>

<div class="h-full w-full overflow-hidden bg-white">
  <iframe
    bind:this={iframeEl}
    sandbox="allow-same-origin"
    title="HTML Preview"
    class="h-full w-full border-0"
  ></iframe>
</div>
