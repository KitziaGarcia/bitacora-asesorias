<script setup lang="ts">
import { ref } from 'vue';
import { applyTheme, initialTheme, type Theme } from './lib/theme';

const theme = ref<Theme>(initialTheme());
applyTheme(theme.value);

function toggleTheme() {
  theme.value = theme.value === 'dark' ? 'light' : 'dark';
  applyTheme(theme.value);
}
</script>

<template>
  <header class="app-header">
    <h1>Registro de clases</h1>
    <button
      type="button"
      class="theme-toggle"
      :aria-label="theme === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'"
      @click="toggleTheme"
    >
      {{ theme === 'dark' ? 'Claro' : 'Oscuro' }}
    </button>
  </header>
  <main class="container"><RouterView /></main>
</template>
