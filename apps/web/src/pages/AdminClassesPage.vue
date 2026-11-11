<script setup lang="ts">
import { onMounted, ref } from 'vue';
import type { AdminClassInfo, AdminTeacherInfo } from '@bitacora/shared';
import { ApiError, createAdminAssignment, createAdminClass, getAdminClasses, getAdminTeachers } from '../api';

const classes = ref<AdminClassInfo[]>([]);
const teachers = ref<AdminTeacherInfo[]>([]);
const loading = ref(true);
const savingClass = ref(false);
const savingAssignment = ref(false);
const error = ref('');
const notice = ref('');

const classCode = ref('');
const className = ref('');
const classTeacherId = ref('');
const assignmentClassCode = ref('');
const assignmentTeacherId = ref('');

function messageFor(cause: unknown, fallback: string): string {
  if (!(cause instanceof ApiError)) return fallback;
  const messages: Record<string, string> = {
    CLASS_EXISTS: 'Ya existe una materia con ese código.',
    ASSIGNMENT_EXISTS: 'Ese maestro ya está relacionado con la materia.',
    CLASS_NOT_FOUND: 'La materia seleccionada ya no existe.',
    TEACHER_NOT_FOUND: 'El maestro seleccionado ya no existe.',
    UNAUTHORIZED: 'Tu sesión de administrador expiró. Inicia sesión de nuevo.',
  };
  return messages[cause.code] ?? cause.message ?? fallback;
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    [classes.value, teachers.value] = await Promise.all([getAdminClasses(), getAdminTeachers()]);
  } catch (cause) {
    error.value = messageFor(cause, 'No se pudieron cargar las materias.');
  } finally {
    loading.value = false;
  }
}

async function submitClass() {
  if (savingClass.value || !classCode.value.trim() || !className.value.trim() || !classTeacherId.value) return;
  savingClass.value = true;
  error.value = '';
  notice.value = '';
  try {
    await createAdminClass({
      code: classCode.value.trim().toLowerCase(),
      name: className.value.trim(),
      teacherId: classTeacherId.value,
    });
    classCode.value = '';
    className.value = '';
    classTeacherId.value = '';
    notice.value = 'Materia creada y relacionada con el maestro. Su QR ya está disponible en el portal estudiantil.';
    await load();
  } catch (cause) {
    error.value = messageFor(cause, 'No se pudo crear la materia.');
  } finally {
    savingClass.value = false;
  }
}

async function submitAssignment() {
  if (savingAssignment.value || !assignmentClassCode.value || !assignmentTeacherId.value) return;
  savingAssignment.value = true;
  error.value = '';
  notice.value = '';
  try {
    await createAdminAssignment({ classCode: assignmentClassCode.value, teacherId: assignmentTeacherId.value });
    assignmentClassCode.value = '';
    assignmentTeacherId.value = '';
    notice.value = 'Relación creada. Ese maestro tendrá un QR distinto para esta materia.';
    await load();
  } catch (cause) {
    error.value = messageFor(cause, 'No se pudo relacionar la materia con el maestro.');
  } finally {
    savingAssignment.value = false;
  }
}

onMounted(load);
</script>

<template>
  <section class="admin-page">
    <div class="section-heading">
      <div>
        <span class="eyebrow">CATÁLOGO ACADÉMICO</span>
        <h2>Dar de alta materia</h2>
        <p>Crea la materia y asígnala al maestro que mostrará su QR.</p>
      </div>
    </div>

    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p v-if="notice" class="success admin-notice" role="status">{{ notice }}</p>
    <p v-if="!loading && !teachers.length" class="notice"><strong>Primero registra un maestro.</strong><br />Una materia nueva necesita una relación maestro–materia para generar su QR.</p>

    <div class="admin-form-grid">
      <form class="card admin-form" @submit.prevent="submitClass">
        <h3>Nueva materia</h3>
        <label for="class-code">Código interno</label>
        <input id="class-code" v-model="classCode" class="input" required maxlength="80" placeholder="poo" pattern="[a-z0-9]+(-[a-z0-9]+)*" />
        <p class="form-help">Usa minúsculas, números y guiones.</p>
        <label for="class-name">Nombre visible</label>
        <input id="class-name" v-model="className" class="input" required maxlength="120" placeholder="Programación Orientada a Objetos" />
        <label for="class-teacher">Maestro responsable</label>
        <select id="class-teacher" v-model="classTeacherId" class="input" required>
          <option value="" disabled>Selecciona un maestro</option>
          <option v-for="teacher in teachers" :key="teacher.id" :value="teacher.id">{{ teacher.name }}</option>
        </select>
        <button class="btn" type="submit" :disabled="savingClass || !teachers.length">{{ savingClass ? 'Guardando…' : 'Crear materia' }}</button>
      </form>

      <form class="card admin-form" @submit.prevent="submitAssignment">
        <h3>Relacionar otra vez</h3>
        <p class="form-help form-help-intro">Una misma materia puede tener varios maestros. Cada relación genera un QR independiente.</p>
        <label for="assignment-class">Materia existente</label>
        <select id="assignment-class" v-model="assignmentClassCode" class="input" required>
          <option value="" disabled>Selecciona una materia</option>
          <option v-for="item in classes" :key="item.code" :value="item.code">{{ item.name }}</option>
        </select>
        <label for="assignment-teacher">Maestro</label>
        <select id="assignment-teacher" v-model="assignmentTeacherId" class="input" required>
          <option value="" disabled>Selecciona un maestro</option>
          <option v-for="teacher in teachers" :key="teacher.id" :value="teacher.id">{{ teacher.name }}</option>
        </select>
        <button class="btn" type="submit" :disabled="savingAssignment || !classes.length || !teachers.length">{{ savingAssignment ? 'Guardando…' : 'Agregar relación' }}</button>
      </form>
    </div>

    <section class="records-panel admin-list-panel">
      <header class="records-header"><h2>Materias y maestros</h2><span>{{ classes.length }} materias</span></header>
      <p v-if="loading" class="records-message">Cargando materias…</p>
      <p v-else-if="!classes.length" class="records-message">Aún no hay materias registradas.</p>
      <div v-else class="table-scroll">
        <table class="records-table">
          <caption class="sr-only">Materias y maestros relacionados</caption>
          <thead><tr><th scope="col">Materia</th><th scope="col">Código</th><th scope="col">Maestros con QR</th></tr></thead>
          <tbody>
            <tr v-for="item in classes" :key="item.code">
              <td><strong>{{ item.name }}</strong></td>
              <td class="student-id">{{ item.code }}</td>
              <td>
                <span v-if="item.assignments.length" class="chip-list">
                  <span v-for="assignment in item.assignments" :key="assignment.id" class="chip">{{ assignment.teacherName }}</span>
                </span>
                <span v-else class="muted">Sin maestro asignado</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </section>
</template>
