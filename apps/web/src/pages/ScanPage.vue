<script setup lang="ts">
import { onMounted, ref } from 'vue';
import AppIcon from '../components/AppIcon.vue';
import { useRoute, useRouter } from 'vue-router';
import type { RegistrationDto } from '@bitacora/shared';
import { registerScan, ApiError } from '../api';
import { errorMessage, parseScanQuery } from '../lib/scan';

const route = useRoute();
const router = useRouter();
const state = ref<'loading' | 'success' | 'error'>('loading');
const missing = ref(false);
const registration = ref<RegistrationDto | null>(null);
const error = ref('');

async function run() {
  const q = parseScanQuery(route.query);
  if (!q) { missing.value = true; return; }
  state.value = 'loading';
  try {
    registration.value = await registerScan(q.classCode, q.sig);
    state.value = 'success';
    // drop the one-time QR params so reload/Back does not re-register
    router.replace({ path: '/scan', query: {} }).catch(() => {});
  } catch (e) {
    error.value = errorMessage(e instanceof ApiError ? e.code : 'INTERNAL');
    state.value = 'error';
  }
}
onMounted(run);
</script>

<template>
  <section class="card">
    <p v-if="missing" class="error">Este enlace no contiene los datos del QR. Escanea de nuevo el código QR de una clase.</p>
    <p v-else-if="state === 'loading'"><span class="spinner" aria-hidden="true"></span> Registrando…</p>
    <template v-else-if="state === 'success' && registration">
      <p class="success icon-heading"><AppIcon name="check" /> Registrado</p>
      <p><strong>{{ registration.className }}</strong></p>
      <p>{{ new Date(registration.registeredAt).toLocaleString('es-MX') }}</p>
    </template>
    <template v-else>
      <p class="error" role="alert">{{ error }}</p>
      <button class="btn" type="button" @click="run">Intentar de nuevo</button>
    </template>
    <RouterLink class="link" to="/">Volver a las clases</RouterLink>
  </section>
</template>
