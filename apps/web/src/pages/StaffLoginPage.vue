<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import type { StaffRole } from '@bitacora/shared';
import { ApiError, staffLogin } from '../api';
import { setStaffSession } from '../lib/staff-session';

const props = defineProps<{ role: StaffRole }>();
const router = useRouter();
const username = ref('');
const password = ref('');
const loading = ref(false);
const error = ref('');

async function submit() {
  if (loading.value) return;
  loading.value = true;
  error.value = '';
  try {
    const session = await staffLogin(props.role, username.value.trim(), password.value);
    setStaffSession(props.role, session);
    await router.replace(props.role === 'admin' ? '/admin' : '/profesores');
  } catch (cause) {
    error.value = cause instanceof ApiError && cause.code === 'INVALID_CREDENTIALS'
      ? 'Revisa el usuario y la contraseña.'
      : 'No se pudo iniciar sesión. Inténtalo de nuevo.';
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <section class="login-layout">
    <div class="login-copy">
      <h1>{{ role === 'admin' ? 'Portal de administración' : 'Portal docente' }}</h1>
      <RouterLink class="link" to="/inicio">Elegir otro portal</RouterLink>
    </div>
    <form class="card login-card" @submit.prevent="submit">
      <h2>Iniciar sesión</h2>
      <label for="staff-username">Usuario</label>
      <input id="staff-username" v-model="username" class="input" autocomplete="username" required maxlength="80" />
      <label for="staff-password">Contraseña</label>
      <input id="staff-password" v-model="password" class="input" type="password" autocomplete="current-password" required maxlength="128" />
      <button class="btn" type="submit" :disabled="loading">{{ loading ? 'Entrando…' : 'Entrar' }}</button>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
    </form>
  </section>
</template>
