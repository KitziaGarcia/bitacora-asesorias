<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import type { ClassInfo, RegistrationDto } from '@bitacora/shared';
import { getMe, getClasses, getRegistrations, qrUrl } from '../api';
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
  router.replace('/login');
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
  <div class="row">
    <span v-if="name">Hola, {{ name }}</span>
    <button class="btn btn-secondary" type="button" @click="logout">Cerrar sesión</button>
  </div>

  <p v-if="loading"><span class="spinner" aria-hidden="true"></span> Cargando clases…</p>
  <div v-else-if="failed" class="card">
    <p class="error">No se pudieron cargar las clases.</p>
    <button class="btn" type="button" @click="loadClasses">Reintentar</button>
  </div>
  <p v-else-if="!classes.length">No hay clases disponibles.</p>
  <div v-else class="grid">
    <button v-for="c in classes" :key="c.code" class="btn" type="button" @click="openQr(c)">{{ c.name }}</button>
  </div>

  <section class="card">
    <h2>Tus registros</h2>
    <p v-if="!registrations.length">Aún no tienes registros</p>
    <ul v-else class="list">
      <li v-for="r in registrations" :key="r.id">
        <strong>{{ r.className }}</strong>
        <span>{{ new Date(r.registeredAt).toLocaleString('es-MX') }}</span>
      </li>
    </ul>
  </section>

  <div v-if="selected" class="overlay" @click.self="selected = null">
    <div class="modal" role="dialog" aria-modal="true">
      <h2>{{ selected.name }}</h2>
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
      <button class="btn btn-secondary" type="button" @click="selected = null">Cerrar</button>
    </div>
  </div>
</template>
