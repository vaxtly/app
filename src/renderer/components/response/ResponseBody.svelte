<script lang="ts">
  import CodeEditor from '../CodeEditor.svelte'
  import { detectLanguage, formatBody } from '../../lib/utils/formatters'

  interface Props {
    body: string
    headers: Record<string, string>
  }

  let { body, headers }: Props = $props()

  let language = $derived(detectLanguage(headers))
  let formattedBody = $derived(formatBody(body, language))
</script>

<div class="h-full p-2">
  <CodeEditor value={formattedBody} {language} readonly />
</div>
