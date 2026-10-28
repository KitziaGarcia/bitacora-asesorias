<script setup lang="ts">
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { login, ApiError } from '../api';
import { setToken } from '../lib/token';
import { errorMessage, safeRedirect } from '../lib/scan';

const route = useRoute();
const router = useRouter();
const studentId = ref('');
const loading = ref(false);
const error = ref('');

async function submit() {
  const id = studentId.value.trim();
  if (!id || loading.value) return;
  loading.value = true;
  error.value = '';
  try {
    const { token } = await login(id);
    setToken(token);
    await router.replace(safeRedirect(route.query.redirect) ?? '/');
  } catch (e) {
    error.value = errorMessage(e instanceof ApiError ? e.code : 'INTERNAL');
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <form class="card" @submit.prevent="submit">
    <label for="student-id">Ingresa tu matrícula</label>
    <input id="student-id" v-model="studentId" class="input" autofocus inputmode="text"
           autocapitalize="off" autocomplete="off" />
    <button class="btn" type="submit" :disabled="!studentId.trim() || loading">
      {{ loading ? 'Iniciando sesión…' : 'Iniciar sesión' }}
    </button>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
  </form>
</template>
