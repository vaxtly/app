<script lang="ts">
  interface Props {
    body: string
  }

  let { body }: Props = $props()

  let blobUrl = $state<string | null>(null)

  $effect(() => {
    if (body) {
      const blob = new Blob([body], { type: 'text/html' })
      const url = URL.createObjectURL(blob)
      blobUrl = url
      return () => URL.revokeObjectURL(url)
    } else {
      blobUrl = null
    }
  })
</script>

<div class="h-full w-full overflow-hidden bg-white">
  {#if blobUrl}
    <iframe
      src={blobUrl}
      sandbox=""
      title="HTML Preview"
      class="h-full w-full border-0"
    ></iframe>
  {/if}
</div>
