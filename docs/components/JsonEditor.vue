<template>
  <div class="h-full flex flex-col">
    <div class="flex-1 relative">
      <UTextarea
        v-model="jsonText"
        @input="handleInput"
        :rows="20"
        autoresize
        :color="error ? 'error' : 'primary'"
        class="absolute inset-0 w-full h-full font-mono text-sm"
        :ui="{ root: 'h-full', base: 'h-full resize-none' }"
      />
    </div>
    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      :title="error"
      icon="i-heroicons-exclamation-triangle"
    />
    <UAlert
      v-else
      color="success"
      variant="subtle"
      title="Valid JSON"
      icon="i-heroicons-check-circle"
    />
  </div>
</template>

<script setup lang="ts">
const emit = defineEmits<{
  update: [value: any]
}>()

const jsonText = ref('')
const error = ref<string | null>(null)

function handleInput(e: InputEvent) {
  const value = (e.target as HTMLTextAreaElement)?.value || '';

  try {
    const parsed = JSON.parse(value)
    error.value = null
    emit('update', parsed)
  } catch (e: any) {
    error.value = e.message
  }
}
</script>
