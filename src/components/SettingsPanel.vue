<script setup lang="ts">
import { computed } from 'vue'
import { AlertCircle, Check, X } from 'lucide-vue-next'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { useStoragePersistence } from '@/composables/useStoragePersistence'

const props = defineProps<{
  isOpen: boolean
}>()

const emit = defineEmits<{
  'update:isOpen': [value: boolean]
}>()

const { isPersistent, isSupported, isLoading, error, requestPersistence, revokePersistence } =
  useStoragePersistence()

// Show warning when storage is not persistent and API is supported
const showWarning = computed(() => isSupported.value && !isPersistent.value)

// Status text for the storage state
const statusText = computed(() => {
  if (!isSupported.value) {
    return 'Persistent storage is not supported in this browser'
  }
  return isPersistent.value
    ? 'Storage is persistent - your data is protected'
    : 'Storage is not persistent - data may be cleared by the browser'
})

// Status icon
const StatusIcon = computed(() => {
  if (!isSupported.value) return AlertCircle
  return isPersistent.value ? Check : X
})

// Status color classes
const statusClasses = computed(() => {
  if (!isSupported.value) return 'text-muted-foreground'
  return isPersistent.value ? 'text-green-600' : 'text-destructive'
})

const handleToggle = async (checked: boolean) => {
  if (isLoading.value) return

  if (checked) {
    // Request persistence
    await requestPersistence()
  } else {
    // Cannot revoke programmatically
    await revokePersistence()
  }
}

const handleClose = () => {
  emit('update:isOpen', false)
}
</script>

<template>
  <Sheet :open="props.isOpen" @update:open="handleClose">
    <SheetContent side="right" class="w-full sm:max-w-md">
      <SheetHeader>
        <SheetTitle>Settings</SheetTitle>
        <SheetDescription>
          Configure app preferences and storage options
        </SheetDescription>
      </SheetHeader>

      <div class="mt-6 space-y-6">
        <!-- Storage Persistence Section -->
        <div class="space-y-4">
          <div>
            <h3 class="text-lg font-semibold">Storage Persistence</h3>
            <p class="text-sm text-muted-foreground mt-1">
              Persistent storage ensures your offline map data won't be deleted by the browser.
            </p>
          </div>

          <!-- Toggle Control -->
          <div
            class="flex items-center justify-between p-4 border rounded-lg"
            :class="showWarning ? 'border-destructive bg-destructive/5' : 'border-border'"
          >
            <div class="flex items-center gap-3 flex-1">
              <!-- Warning Icon -->
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
                  class="h-8 w-8 p-0 flex items-center justify-center rounded-full shrink-0"
                  aria-label="Warning: storage not persistent"
                >
                  <AlertCircle :size="16" />
                </Badge>
              </Transition>

              <div class="flex-1">
                <div class="font-medium">Persistent Storage</div>
                <div class="text-sm text-muted-foreground">
                  {{ isLoading ? 'Checking...' : isPersistent ? 'Enabled' : 'Disabled' }}
                </div>
              </div>
            </div>

            <Switch
              :checked="isPersistent"
              @update:checked="handleToggle"
              :disabled="!isSupported || isLoading"
              :aria-label="`Toggle persistent storage - currently ${isPersistent ? 'enabled' : 'disabled'}`"
            />
          </div>

          <!-- Status Display -->
          <div
            class="flex items-start gap-2 p-3 rounded-lg bg-muted"
            :class="statusClasses"
          >
            <component :is="StatusIcon" :size="18" class="mt-0.5 shrink-0" />
            <p class="text-sm">{{ statusText }}</p>
          </div>

          <!-- Error Display -->
          <Transition
            enter-active-class="transition-all duration-200 ease-out"
            enter-from-class="opacity-0 -translate-y-2"
            enter-to-class="opacity-100 translate-y-0"
            leave-active-class="transition-all duration-150 ease-in"
            leave-from-class="opacity-100 translate-y-0"
            leave-to-class="opacity-0 -translate-y-2"
          >
            <div
              v-if="error"
              class="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive text-destructive"
            >
              <AlertCircle :size="18" class="mt-0.5 shrink-0" />
              <p class="text-sm">{{ error }}</p>
            </div>
          </Transition>

          <!-- Help Text -->
          <div class="text-xs text-muted-foreground space-y-2 p-3 bg-muted rounded-lg">
            <p class="font-medium">What is persistent storage?</p>
            <p>
              When enabled, the browser promises not to automatically clear your stored data (like
              offline map tiles) to free up space. This ensures your offline maps remain available.
            </p>
            <p v-if="!isSupported" class="text-destructive">
              Your browser doesn't support the Storage API. Data persistence cannot be guaranteed.
            </p>
          </div>
        </div>
      </div>
    </SheetContent>
  </Sheet>
</template>
