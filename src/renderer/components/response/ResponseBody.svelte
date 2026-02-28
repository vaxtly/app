<script lang="ts">
  import CodeEditor from '../CodeEditor.svelte'
  import { detectLanguage, formatBody } from '../../lib/utils/formatters'

  interface Props {
    body: string
    headers: Record<string, string>
    streamingBody?: string
  }

  let { body, headers, streamingBody }: Props = $props()

  let language = $derived(detectLanguage(headers))
  let formattedBody = $derived(formatBody(body, language))

  let displayBody = $derived(streamingBody != null ? streamingBody : formattedBody)
  let isStreaming = $derived(streamingBody != null)
</script>

<div class="h-full p-2">
  <CodeEditor value={displayBody} language={isStreaming ? 'text' : language} readonly appendOnly={isStreaming} />
</div>
