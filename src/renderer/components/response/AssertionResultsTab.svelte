<script lang="ts">
  import type { AssertionResult } from '../../lib/types'

  interface Props {
    results: AssertionResult[]
  }

  let { results }: Props = $props()

  const operatorLabels: Record<string, string> = {
    equals: 'equals',
    not_equals: 'does not equal',
    contains: 'contains',
    not_contains: 'does not contain',
    exists: 'exists',
    not_exists: 'does not exist',
    less_than: 'is less than',
    greater_than: 'is greater than',
    matches_regex: 'matches regex',
  }

  const typeLabels: Record<string, string> = {
    status: 'Status',
    header: 'Header',
    json_path: 'JSON Path',
    response_time: 'Response Time',
  }

  let passed = $derived(results.filter((r) => r.passed).length)
  let failed = $derived(results.filter((r) => !r.passed).length)

  function describeAssertion(r: AssertionResult): string {
    const type = typeLabels[r.assertion.type] ?? r.assertion.type
    const target = r.assertion.target
    const operator = operatorLabels[r.assertion.operator] ?? r.assertion.operator

    const prefix = target ? `${type} ${target}` : type

    if (r.assertion.operator === 'exists' || r.assertion.operator === 'not_exists') {
      return `${prefix} ${operator}`
    }

    return `${prefix} ${operator} ${r.assertion.expected}`
  }

  function isValuelessOperator(operator: string): boolean {
    return operator === 'exists' || operator === 'not_exists'
  }
</script>

<div class="flex h-full flex-col">
  {#if results.length === 0}
    <div class="flex flex-1 items-center justify-center">
      <p class="text-[13px] text-surface-500">No test results</p>
    </div>
  {:else}
    <!-- Summary bar -->
    <div class="flex items-center gap-2.5 border-b border-surface-700 bg-surface-800/50 px-3 py-2 text-xs">
      <span class="flex items-center gap-1.5">
        <span class="inline-block h-2 w-2 rounded-full bg-emerald-400" style="box-shadow: 0 0 4px oklch(76.5% 0.177 163.22 / 0.5)"></span>
        <span class="text-emerald-400">{passed} passed</span>
      </span>
      <span class="text-surface-600">|</span>
      <span class="flex items-center gap-1.5">
        <span class="inline-block h-2 w-2 rounded-full bg-red-400" style="box-shadow: 0 0 4px oklch(70.4% 0.191 22.22 / 0.5)"></span>
        <span class="text-red-400">{failed} failed</span>
      </span>
    </div>

    <!-- Results table -->
    <div class="flex-1 overflow-y-auto">
      <table class="w-full border-collapse text-xs">
        <thead class="sticky top-0 z-10" style="background: var(--color-surface-800)">
          <tr style="border-bottom: 1px solid var(--glass-border)">
            <th class="w-8 px-3 py-1.5 text-left text-[10px] font-medium uppercase tracking-widest text-surface-500"></th>
            <th class="px-3 py-1.5 text-left text-[10px] font-medium uppercase tracking-widest text-surface-500">Assertion</th>
            <th class="px-3 py-1.5 text-left text-[10px] font-medium uppercase tracking-widest text-surface-500">Actual</th>
            <th class="px-3 py-1.5 text-left text-[10px] font-medium uppercase tracking-widest text-surface-500">Expected</th>
            <th class="px-3 py-1.5 text-left text-[10px] font-medium uppercase tracking-widest text-surface-500">Error</th>
          </tr>
        </thead>
        <tbody>
          {#each results as result, i (i)}
            <tr class="transition-colors duration-100 hover:bg-surface-700/30" style="border-bottom: 1px solid var(--glass-border)">
              <!-- Status dot -->
              <td class="px-3 py-2">
                {#if result.passed}
                  <span class="inline-block h-2 w-2 rounded-full bg-emerald-400" style="box-shadow: 0 0 4px oklch(76.5% 0.177 163.22 / 0.5)"></span>
                {:else}
                  <span class="inline-block h-2 w-2 rounded-full bg-red-400" style="box-shadow: 0 0 4px oklch(70.4% 0.191 22.22 / 0.5)"></span>
                {/if}
              </td>

              <!-- Description -->
              <td class="px-3 py-2 text-surface-300">{describeAssertion(result)}</td>

              <!-- Actual value -->
              <td class="px-3 py-2 font-mono text-[11px] text-surface-300" style="font-feature-settings: var(--font-feature-mono)">
                {result.actual ?? '\u2014'}
              </td>

              <!-- Expected value -->
              <td class="px-3 py-2 font-mono text-[11px] text-surface-400" style="font-feature-settings: var(--font-feature-mono)">
                {#if isValuelessOperator(result.assertion.operator)}
                  &nbsp;
                {:else}
                  {result.assertion.expected}
                {/if}
              </td>

              <!-- Error -->
              <td class="px-3 py-2 text-[11px] text-red-400">
                {#if result.error}
                  {result.error}
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>
