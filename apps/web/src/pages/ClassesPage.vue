<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import AppIcon from '../components/AppIcon.vue';
import { useRouter } from 'vue-router';
import type { RegistrationDto, TeacherInfo } from '@bitacora/shared';
import { getMe, getTeachers, getRegistrations, qrUrl, getScanLink } from '../api';
import { setToken } from '../lib/token';

const router = useRouter();
const name = ref('');
type AssignedClass = TeacherInfo['classes'][number];
const teachers = ref<TeacherInfo[]>([]);
const teacherId = ref('');
const teacher = computed(() => teachers.value.find(item => item.id === teacherId.value));
const classes = computed(() => teacher.value?.classes ?? []);
const loading = ref(true);
const failed = ref(false);
const registrations = ref<RegistrationDto[]>([]);
const selected = ref<AssignedClass | null>(null);
const qrState = ref<'loading' | 'ready' | 'error'>('loading');
const qrSrc = ref('');
const linkLoading = ref(false);
const linkError = ref('');
async function testScan() {
  if (!selected.value || linkLoading.value) return;
  linkLoading.value = true;
  linkError.value = '';
  try {
    const { url } = await getScanLink(selected.value.code, selected.value.assignmentId);
    const target = new URL(url);
    await router.push(`/scan${target.search}`);
  } catch { linkError.value = 'No se pudo abrir el enlace. Inténtalo de nuevo.'; }
  finally { linkLoading.value = false; }
}
let timer: ReturnType<typeof setInterval> | undefined;

async function loadClasses() {
  loading.value = true;
  failed.value = false;
  try { teachers.value = await getTeachers(); } catch { failed.value = true; } finally { loading.value = false; }
}
async function loadRegistrations() {
  try { registrations.value = await getRegistrations(); } catch { /* keep last list */ }
}
function openQr(c: AssignedClass) {
  selected.value = c;
  linkError.value = '';
  qrState.value = 'loading';
  qrSrc.value = qrUrl(c.code, c.assignmentId);
}
function retryQr() {
  if (!selected.value) return;
  qrState.value = 'loading';
  qrSrc.value = `${qrUrl(selected.value.code, selected.value.assignmentId)}&t=${Date.now()}`;
}
function logout() {
  setToken(null);
  router.replace('/inicio');
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') selected.value = null;
}

onMounted(() => {
  getMe().then(s => { name.value = s.name; }).catch(() => {});
  loadClasses();
  loadRegistrations();
  timer = setInterval(loadRegistrations, 3000);
  window.addEventListener('keydown', onKey);
});
onUnmounted(() => {
  clearInterval(timer);
  window.removeEventListener('keydown', onKey);
});
</script>

<template>
  <div class="page-heading">
    <div><span class="eyebrow">PORTAL ESTUDIANTIL</span><h1>Tu bitácora académica</h1><p v-if="name">Bienvenido, {{ name }}. Cada asesoría cuenta.</p></div>
    <button class="btn btn-secondary" type="button" @click="logout"><AppIcon name="logout" /> Cerrar sesión</button>
  </div>
  <div class="section-heading"><div><h2>Registra una asesoría</h2><p>Selecciona al maestro que te atendió.</p></div></div>

  <p v-if="loading"><span class="spinner" aria-hidden="true"></span> Cargando maestros…</p>
  <div v-else-if="failed" class="card">
    <p class="error">No se pudieron cargar los maestros.</p>
    <button class="btn" type="button" @click="loadClasses">Reintentar</button>
  </div>
  <p v-else-if="!teachers.length">No hay maestros con materias asignadas.</p>
  <fieldset v-else class="teacher-picker">
    <legend class="sr-only">Selecciona al maestro que te atendió</legend>
    <label v-for="item in teachers" :key="item.id" class="teacher-card" :class="{ 'teacher-card-selected': teacherId === item.id }">
      <input v-model="teacherId" class="sr-only" type="radio" name="advising-teacher" :value="item.id" />
      <AppIcon name="teacher" />
      <span>{{ item.name }}</span>
      <AppIcon v-if="teacherId === item.id" class="teacher-card-check" name="check" />
    </label>
  </fieldset>
  <h3 v-if="teacher" class="teacher-subjects-title">Materias de {{ teacher.name }}</h3>
  <div v-if="classes.length" class="grid">
    <article v-for="c in classes" :key="c.code" class="class-card"><h3 class="class-title"><AppIcon name="book" /><span>{{ c.name }}</span></h3><button class="btn class-qr-button" type="button" :aria-label="`Ver código QR de ${c.name}`" @click="openQr(c)"><AppIcon name="qr" /> Ver QR</button></article>
  </div>

  <section class="records-panel">
    <header class="records-header"><h2 class="icon-heading"><AppIcon name="history" /> Tus registros</h2></header>
    <div v-if="!registrations.length" class="empty-state"><AppIcon class="empty-symbol" name="history" /><h3>Tu historia empieza con una asesoría</h3><p>Cuando escanees un QR, aquí aparecerán la materia y la fecha de tu visita.</p></div>
    <div v-else class="table-scroll">
      <table class="records-table">
        <caption class="sr-only">Historial de tus asesorías</caption>
        <thead><tr><th scope="col">Materia</th><th scope="col">Maestro</th><th scope="col">Fecha y hora</th></tr></thead>
        <tbody><tr v-for="r in registrations" :key="r.id">
          <td><strong>{{ r.className }}</strong></td>
          <td>{{ r.teacherName ?? 'Sin maestro asignado' }}</td>
          <td>{{ new Date(r.registeredAt).toLocaleString('es-MX') }}</td>
        </tr></tbody>
      </table>
    </div>
  </section>

  <div v-if="selected" class="overlay" @click.self="selected = null">
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="qr-title" tabindex="-1">
      <span class="eyebrow">REGISTRO DE ASESORÍA</span><h2 id="qr-title">{{ selected.name }}</h2>
      <p>{{ teacher?.name }}</p>
      <div class="qr-box">
        <span v-if="qrState === 'loading'" class="spinner" aria-hidden="true"></span>
        <img v-show="qrState === 'ready'" :src="qrSrc" :alt="`Código QR de ${selected.name}`" class="qr"
             @load="qrState = 'ready'" @error="qrState = 'error'" />
        <div v-if="qrState === 'error'">
          <p class="error">No se pudo cargar el código QR.</p>
          <button class="btn" type="button" @click="retryQr">Reintentar</button>
        </div>
      </div>
      <p>Escanea este QR con la cámara de tu teléfono para registrarte</p>
      <button class="btn" type="button" :disabled="linkLoading" @click="testScan">{{ linkLoading ? 'Abriendo…' : 'Probar desde esta laptop' }}</button>
      <p class="muted small">Esta opción registra una visita con tu matrícula actual.</p>
      <p v-if="linkError" class="error" role="alert">{{ linkError }}</p>
      <button class="btn btn-secondary" type="button" @click="selected = null">Cerrar</button>
    </div>
  </div>
</template>
