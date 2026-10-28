<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import type { RegistrationDto } from '@bitacora/shared';
import { registerScan, ApiError } from '../api';
import { errorMessage, parseScanQuery } from '../lib/scan';

const route = useRoute();
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
  } catch (e) {
    error.value = errorMessage(e instanceof ApiError ? e.code : 'INTERNAL');
    state.value = 'error';
  }
}
onMounted(run);
</script>

<template>
  <section class="card">
    <p v-if="missing" class="error">This link is missing its QR data. Scan a class QR code again.</p>
    <p v-else-if="state === 'loading'"><span class="spinner" aria-hidden="true"></span> Registering…</p>
    <template v-else-if="state === 'success' && registration">
      <p class="success">Registered ✅</p>
      <p><strong>{{ registration.className }}</strong></p>
      <p>{{ new Date(registration.registeredAt).toLocaleString() }}</p>
    </template>
    <template v-else>
      <p class="error" role="alert">{{ error }}</p>
      <button class="btn" type="button" @click="run">Try again</button>
    </template>
    <RouterLink class="link" to="/">Back to classes</RouterLink>
  </section>
</template>
