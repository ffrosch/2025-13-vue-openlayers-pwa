<script setup lang="ts">
import PWABadge from '@/components/PWABadge.vue';
import Map from '@/components/Map.vue';
import PersistButton from '@/components/PersistButton.vue';
import Reports from '@/components/Reports.vue';
import TileDownloaderDemo from '@/components/TileDownloaderDemo.vue';
import SimpleTileDownloader from '@/components/SimpleTileDownloader.vue';
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

    <div class="grid gap-6 pb-12">
      <div class="container flex justify-center mx-auto">
        <PersistButton />
      </div>

      <Reports class="w-full"/>

      <!-- Simple Tile Downloader (Raw Async Generator Demo) -->
      <div class="container mx-auto px-4">
        <SimpleTileDownloader />
      </div>

      <!-- Tile Downloader Demo (Full-Featured) -->
      <div class="container mx-auto px-4">
        <TileDownloaderDemo />
      </div>

      <Map />

      <PWABadge />
    </div>
  </div>
</template>

<style scoped></style>
