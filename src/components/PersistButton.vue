<script setup lang="ts">
import { Button } from "@/components/ui/button";
import { usePermission } from '@vueuse/core';
import { CheckCircle2Icon, InfoIcon, TriangleAlertIcon } from "lucide-vue-next";
import { computed } from "vue";

const state = usePermission('persistent-storage');
const granted = computed(() => state.value === 'granted');
const denied = computed(() => state.value === 'denied');
const requestPersistent = async () => await navigator.storage.persist();
</script>

<template>
  <Button
      variant="outline"
      :class="granted ? 'text-green-800' : denied ? 'text-orange-600' : 'text-blue-800'"
      @click="requestPersistent"
      :disabled="granted"
  >
    <CheckCircle2Icon v-if="granted" />
    <TriangleAlertIcon v-else-if="denied" />
    <InfoIcon v-else />
    {{ granted ? 'Persistent storage enabled' : denied ? 'Persistent storage denied' : 'Activate persistent storage' }}
  </Button>
</template>

<style scoped></style>
