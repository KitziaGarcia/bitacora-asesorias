<script setup lang="ts">
import { onMounted, ref } from 'vue';
import type { AdminClassInfo, AdminTeacherInfo } from '@bitacora/shared';
import { ApiError, createAdminTeacher, getAdminClasses, getAdminTeachers } from '../api';

const teachers = ref<AdminTeacherInfo[]>([]);
const classes = ref<AdminClassInfo[]>([]);
const loading = ref(true);
const saving = ref(false);
const error = ref('');
const notice = ref('');
const username = ref('');
const name = ref('');
const password = ref('');
const classCodes = ref<string[]>([]);

function messageFor(cause: unknown, fallback: string): string {
  if (!(cause instanceof ApiError)) return fallback;
  const messages: Record<string, string> = {
    USERNAME_EXISTS: 'Ese usuario ya está en uso.',
    CLASS_NOT_FOUND: 'Una de las materias seleccionadas ya no existe.',
    UNAUTHORIZED: 'Tu sesión de administrador expiró. Inicia sesión de nuevo.',
  };
  return messages[cause.code] ?? cause.message ?? fallback;
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    [teachers.value, classes.value] = await Promise.all([getAdminTeachers(), getAdminClasses()]);
  } catch (cause) {
    error.value = messageFor(cause, 'No se pudieron cargar los maestros.');
  } finally {
    loading.value = false;
  }
}

async function submit() {
  if (saving.value || !username.value.trim() || !name.value.trim() || password.value.length < 8) return;
  saving.value = true;
  error.value = '';
  notice.value = '';
  try {
    await createAdminTeacher({
      username: username.value.trim().toLowerCase(),
      name: name.value.trim(),
      password: password.value,
      classCodes: classCodes.value,
    });
    username.value = '';
    name.value = '';
    password.value = '';
    classCodes.value = [];
    notice.value = 'Maestro creado correctamente.';
    await load();
  } catch (cause) {
    error.value = messageFor(cause, 'No se pudo crear el maestro.');
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<template>
  <section class="admin-page">
    <div class="section-heading">
      <div>
        <span class="eyebrow">PERSONAL DOCENTE</span>
        <h2>Dar de alta maestro</h2>
        <p>Crea su acceso y, si quieres, asigna sus materias desde el inicio.</p>
      </div>
    </div>

    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p v-if="notice" class="success admin-notice" role="status">{{ notice }}</p>

    <form class="card admin-form teacher-form" @submit.prevent="submit">
      <h3>Nuevo maestro</h3>
      <div class="admin-form-columns">
        <div>
          <label for="teacher-name">Nombre completo</label>
          <input id="teacher-name" v-model="name" class="input" required maxlength="120" placeholder="María Luisa" />
        </div>
        <div>
          <label for="teacher-username">Usuario</label>
          <input id="teacher-username" v-model="username" class="input" required maxlength="80" pattern="[a-zA-Z0-9._-]+" autocomplete="username" placeholder="maria.luisa" />
        </div>
        <div>
          <label for="teacher-password">Contraseña inicial</label>
          <input id="teacher-password" v-model="password" class="input" required minlength="8" maxlength="128" type="password" autocomplete="new-password" placeholder="Mínimo 8 caracteres" />
        </div>
        <div>
          <label for="teacher-classes">Materias iniciales</label>
          <select id="teacher-classes" v-model="classCodes" class="input" multiple size="4">
            <option v-for="item in classes" :key="item.code" :value="item.code">{{ item.name }}</option>
          </select>
          <p class="form-help">Puedes seleccionar varias con Ctrl/Cmd. También podrás asignarlas después.</p>
        </div>
      </div>
      <button class="btn" type="submit" :disabled="saving">{{ saving ? 'Guardando…' : 'Crear maestro' }}</button>
    </form>

    <section class="records-panel admin-list-panel">
      <header class="records-header"><h2>Maestros registrados</h2><span>{{ teachers.length }} maestros</span></header>
      <p v-if="loading" class="records-message">Cargando maestros…</p>
      <p v-else-if="!teachers.length" class="records-message">Aún no hay maestros registrados.</p>
      <div v-else class="table-scroll">
        <table class="records-table">
          <caption class="sr-only">Maestros registrados y sus materias</caption>
          <thead><tr><th scope="col">Maestro</th><th scope="col">Usuario</th><th scope="col">Materias asignadas</th></tr></thead>
          <tbody>
            <tr v-for="teacher in teachers" :key="teacher.id">
              <td><strong>{{ teacher.name }}</strong></td>
              <td class="student-id">{{ teacher.username }}</td>
              <td>
                <span v-if="teacher.classes.length" class="chip-list">
                  <span v-for="item in teacher.classes" :key="item.assignmentId" class="chip">{{ item.name }}</span>
                </span>
                <span v-else class="muted">Sin materias asignadas</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </section>
</template>
