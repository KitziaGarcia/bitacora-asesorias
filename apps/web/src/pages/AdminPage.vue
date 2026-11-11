<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import AppIcon from '../components/AppIcon.vue';
import { setStaffSession } from '../lib/staff-session';

const expanded = ref(true);
const router = useRouter();

function logout() {
  setStaffSession('admin', null);
  router.replace('/inicio');
}
</script>

<template>
  <div class="admin-layout" :class="{ 'admin-layout-collapsed': !expanded }">
    <aside class="admin-sidebar">
      <button
        class="admin-menu-toggle"
        type="button"
        :aria-expanded="expanded"
        :aria-label="expanded ? 'Contraer menú' : 'Expandir menú'"
        :title="expanded ? 'Contraer menú' : 'Expandir menú'"
        aria-controls="admin-menu"
        @click="expanded = !expanded"
      >
        <AppIcon name="menu" />
      </button>
      <nav id="admin-menu" aria-label="Administración">
        <RouterLink to="/admin" exact-active-class="selected" aria-label="Registros" :title="expanded ? undefined : 'Registros'">
          <AppIcon name="history" /><span v-if="expanded">Registros</span>
        </RouterLink>
        <RouterLink to="/admin/materias" exact-active-class="selected" aria-label="Dar de alta materia" :title="expanded ? undefined : 'Dar de alta materia'">
          <AppIcon name="book" /><span v-if="expanded">Dar de alta materia</span>
        </RouterLink>
        <RouterLink to="/admin/maestros" exact-active-class="selected" aria-label="Dar de alta maestro" :title="expanded ? undefined : 'Dar de alta maestro'">
          <AppIcon name="teacher" /><span v-if="expanded">Dar de alta maestro</span>
        </RouterLink>
      </nav>
    </aside>
    <div class="admin-content">
      <div class="page-heading">
        <h1>Portal de administración</h1>
        <button class="btn btn-secondary" type="button" @click="logout"><AppIcon name="logout" /> Cerrar sesión</button>
      </div>
      <RouterView />
    </div>
  </div>
</template>
