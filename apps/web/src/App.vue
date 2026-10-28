<script setup lang="ts">
import AppIcon from './components/AppIcon.vue';
</script>
<template>
  <header class="app-header">
    <RouterLink to="/inicio" class="brand"><img class="brand-crest" src="/uabc-escudo.png" alt="Escudo de la UABC" width="54" height="74" /><span><strong>Universidad Autónoma de Baja California</strong><small>Bitácora de asesorías académicas</small></span></RouterLink>
    <nav class="header-actions" aria-label="Navegación principal"><RouterLink to="/inicio"><AppIcon name="home" /> Inicio</RouterLink>
    </nav>
  </header>
  <main class="container"><RouterView /></main>
  <footer class="app-footer"><span>UABC · Asesorías académicas</span><span>Por la realización plena del ser</span></footer>
</template>
