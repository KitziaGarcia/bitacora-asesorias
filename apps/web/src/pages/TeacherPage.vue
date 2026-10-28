<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import AppIcon from '../components/AppIcon.vue';
import { getTeacherRegistrations, type TeacherRegistration } from '../api';
const rows = ref<TeacherRegistration[]>([]);
const loading = ref(true);
const refreshing = ref(false);
const error = ref('');
const query = ref('');
let timer: ReturnType<typeof setInterval> | undefined;
const filtered = computed(() => {
  const text = query.value.trim().toLocaleLowerCase('es');
  return rows.value.filter(r => `${r.studentId} ${r.studentName} ${r.className}`.toLocaleLowerCase('es').includes(text));
});
async function load() {
  if (refreshing.value) return;
  refreshing.value = true;
  try { rows.value = await getTeacherRegistrations(); error.value = ''; }
  catch { error.value = 'No se pudieron cargar los registros. Comprueba que la API esté en ejecución.'; }
  finally { loading.value = false; refreshing.value = false; }
}
onMounted(() => { load(); timer = setInterval(load, 5000); });
onUnmounted(() => clearInterval(timer));
</script>

<template>
  <div class="page-heading"><div><span class="eyebrow">PORTAL DOCENTE</span><h1>Registros de asesorías</h1><p>Consulta las visitas de tus estudiantes y las materias atendidas.</p></div><RouterLink class="btn btn-secondary" to="/inicio"><AppIcon name="home" /> Cambiar de portal</RouterLink></div>
  <div class="demo-label"><span class="badge">Demo</span><p>Acceso directo a todos los registros. La autenticación docente está pendiente.</p></div>
  <section class="records-panel">
    <header class="records-header"><h2 class="icon-heading"><AppIcon name="history" /> Registros</h2><span>{{ rows.length }} en total</span></header>
    <div class="records-toolbar"><label for="record-search">Buscar registros</label><input id="record-search" v-model="query" class="input" type="search" placeholder="Matrícula, estudiante o materia" /><button class="btn btn-secondary" type="button" :disabled="refreshing" @click="load">{{ refreshing ? 'Actualizando…' : 'Actualizar' }}</button></div>
    <div v-if="error" class="records-message error" role="alert">{{ error }}</div>
    <p v-if="loading" class="records-message" role="status"><span class="spinner" aria-hidden="true"></span> Cargando registros…</p>
    <div v-else-if="!rows.length && !error" class="empty-state"><AppIcon class="empty-symbol" name="history" /><h3>Aún no hay registros</h3><p>Las visitas registradas por los estudiantes aparecerán aquí.</p></div>
    <p v-else-if="rows.length && !filtered.length" class="records-message">No hay registros que coincidan con tu búsqueda.</p>
    <div v-if="filtered.length" class="table-scroll"><table class="records-table"><caption class="sr-only">Registros de todos los estudiantes, del más reciente al más antiguo</caption><thead><tr><th scope="col">Matrícula</th><th scope="col">Estudiante</th><th scope="col">Materia</th><th scope="col">Fecha y hora</th></tr></thead><tbody><tr v-for="r in filtered" :key="r.id"><td class="student-id">{{ r.studentId }}</td><td>{{ r.studentName === r.studentId ? 'Sin nombre registrado' : r.studentName }}</td><td><strong>{{ r.className }}</strong></td><td>{{ new Date(r.registeredAt).toLocaleString('es-MX') }}</td></tr></tbody></table></div>
    <p class="records-footnote">Actualización automática cada 5 segundos.</p>
  </section>
</template>
