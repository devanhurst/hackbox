<template>
  <div class="py-16">
    <UContainer>
      <div class="text-center">
        <h1 class="text-5xl font-bold text-gray-900 mb-6">
          Hackbox Developer Documentation
        </h1>
        <p class="text-xl text-gray-600 mb-12 max-w-3xl mx-auto">
          Build real-time multiplayer experiences with Hackbox.
          Create custom games where players use their phones as controllers.
        </p>
        <div class="flex justify-center gap-4">
          <UButton
            to="/docs"
            size="xl"
            label="Get Started"
          />
          <UButton
            to="/playground"
            size="xl"
            color="neutral"
            variant="outline"
            label="Try Playground"
          />
        </div>
      </div>

      <div class="mt-24 grid grid-cols-1 gap-8 md:grid-cols-3">
        <UCard>
          <template #header>
            <h3 class="text-lg font-semibold">Real-time Communication</h3>
          </template>
          <p class="text-gray-600">
            Socket.io-based bidirectional communication between hosts and players.
          </p>
        </UCard>
        <UCard>
          <template #header>
            <h3 class="text-lg font-semibold">Dynamic UI Components</h3>
          </template>
          <p class="text-gray-600">
            Send JSON payloads to render buttons, text, choices, and custom components on player devices.
          </p>
        </UCard>
        <UCard>
          <template #header>
            <h3 class="text-lg font-semibold">Interactive Playground</h3>
          </template>
          <p class="text-gray-600">
            Test your payloads in real-time with actual device connections.
          </p>
        </UCard>
      </div>
    </UContainer>
  </div>
</template>
