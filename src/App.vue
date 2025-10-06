<script setup lang="ts">
import PWABadge from '@/components/PWABadge.vue'
</script>

<template>
  <div class="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
    <!-- Hero Section -->
    <header class="container mx-auto px-4 py-16 md:py-24">
      <div class="max-w-4xl mx-auto text-center">
        <h1 class="text-5xl md:text-6xl font-bold text-gray-900 mb-6">
          Vue + OpenLayers PWA
        </h1>
        <p class="text-xl md:text-2xl text-gray-700 mb-8">
          Interactive maps with offline tile storage
        </p>
        <p class="text-lg text-gray-600 max-w-2xl mx-auto">
          A Progressive Web App combining the power of OpenLayers mapping with Vue 3,
          featuring local tile caching for seamless offline functionality.
        </p>
      </div>
    </header>

    <!-- Placeholder Section -->
    <section class="container mx-auto px-4 py-12">
      <div class="max-w-4xl mx-auto">
        <div class="bg-white rounded-lg shadow-lg p-12 text-center">
          <div class="text-gray-400 mb-4">
            <svg class="w-24 h-24 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
            </svg>
          </div>
          <h2 class="text-2xl font-semibold text-gray-700 mb-2">
            Map Coming Soon
          </h2>
          <p class="text-gray-500">
            Interactive OpenLayers map and features will be added here
          </p>
        </div>
      </div>
    </section>

    <PWABadge />
  </div>
</template>

<style scoped>
</style>
