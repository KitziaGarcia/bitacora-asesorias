<script setup lang="ts">
import AppIcon from '../components/AppIcon.vue';
</script>
<template>
  <section class="welcome">
    <span class="eyebrow">COMUNIDAD UNIVERSITARIA</span>
    <h1>Un espacio para aprender.<br><em>Una bitácora para crecer.</em></h1>
    <p class="intro">Registra y consulta tus asesorías académicas en un solo lugar.</p>
    <div class="role-grid">
      <RouterLink class="role-card" to="/login">
        <span class="role-icon"><AppIcon name="student" /></span>
        <h2>Soy estudiante</h2>
        <p>Registra tu visita con un código QR y consulta tu historial de asesorías.</p>
        <span class="role-action">Entrar como estudiante <AppIcon name="arrow" /></span>
      </RouterLink>
      <RouterLink class="role-card" to="/profesores">
        <span class="role-icon"><AppIcon name="teacher" /></span>
        <h2>Soy profesor</h2>
        <p>Un espacio para acompañar a tus estudiantes y dar seguimiento a sus asesorías.</p>
        <span class="role-action">Entrar como profesor <AppIcon name="arrow" /></span>
      </RouterLink>
    </div>
    <p class="welcome-note">Asesorías académicas · Universidad Autónoma de Baja California</p>
  </section>
</template>
