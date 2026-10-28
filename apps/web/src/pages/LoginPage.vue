<script setup lang="ts">
import { ref } from 'vue';
import AppIcon from '../components/AppIcon.vue';
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
  <section class="login-layout"><div class="login-copy"><span class="eyebrow">PORTAL ESTUDIANTIL</span><h1>Tu aprendizaje<br>deja huella.</h1><p>Accede a tu bitácora, registra una asesoría y sigue construyendo tu camino académico.</p><RouterLink class="link" to="/inicio">← Elegir otro portal</RouterLink></div>
  <form class="card login-card" @submit.prevent="submit">
    <span class="eyebrow">BIENVENIDO, CIMARRÓN</span><h2>Accede a tu bitácora</h2><p>Ingresa tu matrícula para continuar.</p>
    <label for="student-id">Ingresa tu matrícula</label>
    <input id="student-id" v-model="studentId" class="input" autofocus inputmode="text"
           autocapitalize="off" autocomplete="off" placeholder="Ej. 1234567" />
    <button class="btn" type="submit" :disabled="!studentId.trim() || loading">
      <AppIcon name="student" /> {{ loading ? 'Iniciando sesión…' : 'Iniciar sesión' }}
    </button>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p class="muted small">Acceso de demostración mediante matrícula.</p>
  </form>
  </section>
</template>
