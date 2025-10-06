<script setup lang="ts">
import { Settings, AlertCircle } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useStoragePersistence } from '@/composables/useStoragePersistence'
import { computed } from 'vue'

const emit = defineEmits<{
  openSettings: []
}>()

const { isPersistent, isSupported } = useStoragePersistence()

// Show warning when storage is not persistent and API is supported
const showWarning = computed(() => isSupported.value && !isPersistent.value)

const handleClick = () => {
  emit('openSettings')
}
</script>

<template>
  <div class="fixed bottom-4 right-4 z-50">
    <div class="relative">
      <Button
        @click="handleClick"
        size="lg"
        class="rounded-full shadow-lg hover:shadow-xl transition-shadow"
        :aria-label="showWarning ? 'Open settings (storage not persistent)' : 'Open settings'"
      >
        <Settings :size="24" />
      </Button>

      <!-- Warning indicator badge -->
      <Transition
        enter-active-class="transition-all duration-200 ease-out"
        enter-from-class="scale-0 opacity-0"
        enter-to-class="scale-100 opacity-100"
        leave-active-class="transition-all duration-150 ease-in"
        leave-from-class="scale-100 opacity-100"
        leave-to-class="scale-0 opacity-0"
      >
        <Badge
          v-if="showWarning"
          variant="destructive"
          class="absolute -top-1 -right-1 h-6 w-6 p-0 flex items-center justify-center rounded-full animate-pulse"
          aria-label="Warning: storage not persistent"
        >
          <AlertCircle :size="14" />
        </Badge>
      </Transition>
    </div>
  </div>
</template>
