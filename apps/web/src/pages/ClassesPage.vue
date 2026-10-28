<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import AppIcon from '../components/AppIcon.vue';
import { useRouter } from 'vue-router';
import type { ClassInfo, RegistrationDto } from '@bitacora/shared';
import { getMe, getClasses, getRegistrations, qrUrl, getScanLink } from '../api';
import { setToken } from '../lib/token';

const router = useRouter();
const name = ref('');
const classes = ref<ClassInfo[]>([]);
const loading = ref(true);
const failed = ref(false);
const registrations = ref<RegistrationDto[]>([]);
const selected = ref<ClassInfo | null>(null);
const qrState = ref<'loading' | 'ready' | 'error'>('loading');
const qrSrc = ref('');
const linkLoading = ref(false);
const linkError = ref('');
async function testScan() {
  if (!selected.value || linkLoading.value) return;
  linkLoading.value = true;
  linkError.value = '';
  try {
    const { url } = await getScanLink(selected.value.code);
    const target = new URL(url);
    await router.push(`/scan${target.search}`);
  } catch { linkError.value = 'No se pudo abrir el enlace. Inténtalo de nuevo.'; }
  finally { linkLoading.value = false; }
}
let timer: ReturnType<typeof setInterval> | undefined;

async function loadClasses() {
  loading.value = true;
  failed.value = false;
  try { classes.value = await getClasses(); } catch { failed.value = true; } finally { loading.value = false; }
}
async function loadRegistrations() {
  try { registrations.value = await getRegistrations(); } catch { /* keep last list */ }
}
function openQr(c: ClassInfo) {
  selected.value = c;
  linkError.value = '';
  qrState.value = 'loading';
  qrSrc.value = qrUrl(c.code);
}
function retryQr() {
  if (!selected.value) return;
  qrState.value = 'loading';
  qrSrc.value = `${qrUrl(selected.value.code)}?t=${Date.now()}`;
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
  <div class="section-heading"><div><h2>Selecciona una materia</h2><p>Abre su código QR para registrar tu asesoría.</p></div><span class="badge">{{ classes.length }} materias</span></div>

  <p v-if="loading"><span class="spinner" aria-hidden="true"></span> Cargando clases…</p>
  <div v-else-if="failed" class="card">
    <p class="error">No se pudieron cargar las clases.</p>
    <button class="btn" type="button" @click="loadClasses">Reintentar</button>
  </div>
  <p v-else-if="!classes.length">No hay clases disponibles.</p>
  <div v-else class="grid">
    <article v-for="c in classes" :key="c.code" class="class-card"><h3 class="class-title"><AppIcon name="book" /><span>{{ c.name }}</span></h3><button class="btn class-qr-button" type="button" :aria-label="`Ver código QR de ${c.name}`" @click="openQr(c)"><AppIcon name="qr" /> Ver QR</button></article>
  </div>

  <section class="records-panel">
    <header class="records-header"><h2 class="icon-heading"><AppIcon name="history" /> Tus registros</h2></header>
    <div v-if="!registrations.length" class="empty-state"><AppIcon class="empty-symbol" name="history" /><h3>Tu historia empieza con una asesoría</h3><p>Cuando escanees un QR, aquí aparecerán la materia y la fecha de tu visita.</p></div>
    <div v-else class="table-scroll"><table class="records-table"><caption class="sr-only">Historial de tus asesorías</caption><thead><tr><th scope="col">Materia</th><th scope="col">Fecha y hora</th></tr></thead><tbody><tr v-for="r in registrations" :key="r.id"><td><strong>{{ r.className }}</strong></td><td>{{ new Date(r.registeredAt).toLocaleString('es-MX') }}</td></tr></tbody></table></div>
  </section>

  <div v-if="selected" class="overlay" @click.self="selected = null">
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="qr-title" tabindex="-1">
      <span class="eyebrow">REGISTRO DE ASESORÍA</span><h2 id="qr-title">{{ selected.name }}</h2>
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
