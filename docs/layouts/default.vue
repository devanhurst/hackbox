<template>
  <div class="min-h-screen bg-gray-50">
    <header class="border-b border-gray-200 bg-white">
      <UContainer>
        <nav class="flex items-center justify-between h-16">
          <div class="flex items-center gap-10">
            <NuxtLink to="/" class="text-2xl font-bold text-primary">
              Hackbox
            </NuxtLink>
            <div class="flex gap-6">
              <NuxtLink
                v-for="link in links"
                :key="link.to"
                :to="link.to"
                class="text-sm font-medium text-gray-700 hover:text-primary transition-colors"
                active-class="text-primary"
              >
                {{ link.label }}
              </NuxtLink>
            </div>
          </div>
        </nav>
      </UContainer>
    </header>
    <main>
      <slot />
    </main>
  </div>
</template>

<script setup lang="ts">
const links = [
  {
    label: 'Home',
    to: '/',
  },
  {
    label: 'Playground',
    to: '/playground',
  },
]
</script>
