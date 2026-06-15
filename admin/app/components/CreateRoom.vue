<script setup lang="ts">
const emit = defineEmits<{ created: [] }>();
const toast = useToast();
const apiUrl = useApi();

const hostId = ref("");
const twitchRequired = ref(false);
const persistent = ref(false);
const closed = ref(false);
const creating = ref(false);

function generate() {
  hostId.value = crypto.randomUUID();
}

async function create() {
  creating.value = true;
  try {
    const data = await $fetch<{ ok: boolean; roomCode?: string; hostId?: string; error?: string }>(
      apiUrl("rooms"),
      {
        method: "POST",
        body: {
          hostId: hostId.value.trim(),
          twitchRequired: twitchRequired.value,
          persistent: persistent.value,
          closed: closed.value,
        },
      },
    );
    if (data.ok) {
      toast.add({
        title: `Room ${data.roomCode} created`,
        description: `hostId ${data.hostId}`,
        color: "success",
        icon: "i-lucide-check",
      });
      emit("created");
    } else {
      toast.add({ title: "Create failed", description: data.error, color: "error" });
    }
  } catch (e: unknown) {
    toast.add({ title: "Create failed", description: String(e), color: "error" });
  } finally {
    creating.value = false;
  }
}
</script>

<template>
  <UCard>
    <div class="flex flex-wrap items-center gap-3">
      <UInput
        v-model="hostId"
        class="min-w-80"
        placeholder="hostId (UUID) — leave blank to generate"
      />
      <UButton color="neutral" variant="subtle" icon="i-lucide-dice-5" @click="generate">
        Generate
      </UButton>
      <UCheckbox v-model="twitchRequired" label="twitchRequired" />
      <UCheckbox v-model="persistent" label="persistent" />
      <UCheckbox v-model="closed" label="closed" />
      <UButton :loading="creating" icon="i-lucide-plus" @click="create">Create room</UButton>
    </div>
  </UCard>
</template>
