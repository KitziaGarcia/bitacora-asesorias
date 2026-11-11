<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import type { StaffRole } from '@bitacora/shared';
import AppIcon from '../components/AppIcon.vue';
import SearchSelect from '../components/SearchSelect.vue';
import { ApiError, getStaffRegistrations, type TeacherRegistration } from '../api';
import { getStaffSession, setStaffSession } from '../lib/staff-session';

const props = defineProps<{ role: StaffRole }>();
const router = useRouter();
const staff = getStaffSession(props.role)?.staff;
const rows = ref<TeacherRegistration[]>([]);
const loading = ref(true);
const refreshing = ref(false);
const error = ref('');
const student = ref('');
const teacher = ref('');
const subject = ref('');
const from = ref('');
const to = ref('');
const order = ref('newest');
let timer: ReturnType<typeof setInterval> | undefined;

const teacherOptions = computed(() => [
  { value: '', label: 'Todos' },
  ...Array.from(new Map(rows.value.map(r => [
    r.teacherId ?? 'legacy', r.teacherName ?? 'Sin maestro asignado',
  ])), ([value, label]) => ({ value, label })),
]);
const subjectOptions = computed(() => [
  { value: '', label: 'Todas' },
  ...Array.from(new Map(rows.value.map(r => [r.classCode, r.className])), ([value, label]) => ({ value, label })),
]);
const orderOptions = [
  { value: 'newest', label: 'Más recientes' },
  { value: 'oldest', label: 'Más antiguos' },
  { value: 'student', label: 'Matrícula' },
  ...(props.role === 'admin' ? [{ value: 'teacher', label: 'Maestro' }] : []),
  { value: 'subject', label: 'Materia' },
];
const localDate = (value: string) => new Date(value).toLocaleDateString('sv-SE');
const filtered = computed(() => {
  const text = student.value.trim().toLocaleLowerCase('es');
  return rows.value.filter(row => {
    const date = localDate(row.registeredAt);
    return (!text || [row.studentId, row.studentName].some(value => value.toLocaleLowerCase('es').includes(text)))
      && (!teacher.value || (row.teacherId === null ? teacher.value === 'legacy' : row.teacherId === teacher.value))
      && (!subject.value || row.classCode === subject.value)
      && (!from.value || date >= from.value)
      && (!to.value || date <= to.value);
  }).sort((a, b) => {
    if (order.value === 'student') return a.studentId.localeCompare(b.studentId, 'es', { numeric: true });
    if (order.value === 'teacher') return (a.teacherName ?? '').localeCompare(b.teacherName ?? '', 'es');
    if (order.value === 'subject') return a.className.localeCompare(b.className, 'es');
    return order.value === 'oldest'
      ? a.registeredAt.localeCompare(b.registeredAt)
      : b.registeredAt.localeCompare(a.registeredAt);
  });
});

function clearFilters() {
  student.value = teacher.value = subject.value = from.value = to.value = '';
  order.value = 'newest';
}

function logout() {
  setStaffSession(props.role, null);
  router.replace('/inicio');
}

async function load() {
  if (refreshing.value) return;
  refreshing.value = true;
  try {
    rows.value = await getStaffRegistrations(props.role);
    error.value = '';
  } catch (cause) {
    if (cause instanceof ApiError && cause.code === 'UNAUTHORIZED') {
      rows.value = [];
      setStaffSession(props.role, null);
      await router.replace(props.role === 'admin' ? '/admin/login' : '/profesores/login');
    } else {
      error.value = 'No se pudieron cargar los registros.';
    }
  } finally {
    loading.value = false;
    refreshing.value = false;
  }
}
onMounted(() => { load(); timer = setInterval(load, 5000); });
onUnmounted(() => clearInterval(timer));
</script>

<template>
  <div v-if="role === 'teacher'" class="page-heading">
    <div>
      <span class="eyebrow">PORTAL DOCENTE</span>
      <h1>Mis asesorías</h1>
      <p>{{ staff?.name }}</p>
    </div>
    <button class="btn btn-secondary" type="button" @click="logout"><AppIcon name="logout" /> Cerrar sesión</button>
  </div>
  <section class="records-panel">
    <header class="records-header">
      <h2 class="icon-heading"><AppIcon name="history" /> Registros</h2>
      <span>{{ filtered.length }} de {{ rows.length }}</span>
    </header>
    <div class="record-filters">
      <label>Alumno<input v-model="student" class="input" type="search" placeholder="Matrícula o nombre" /></label>
      <SearchSelect v-if="role === 'admin'" v-model="teacher" label="Maestro" :options="teacherOptions" />
      <SearchSelect v-model="subject" label="Materia" :options="subjectOptions" />
      <label>Desde<input v-model="from" class="input" type="date" :max="to || undefined" /></label>
      <label>Hasta<input v-model="to" class="input" type="date" :min="from || undefined" /></label>
      <SearchSelect v-model="order" label="Ordenar por" :options="orderOptions" />
    </div>
    <div class="records-toolbar record-actions">
      <button class="btn btn-secondary" type="button" aria-label="Limpiar filtros" title="Limpiar filtros" @click="clearFilters">
        <AppIcon name="filter-clear" />
      </button>
      <button class="btn btn-secondary" type="button" :disabled="refreshing" :aria-label="refreshing ? 'Actualizando registros' : 'Actualizar registros'" title="Actualizar registros" @click="load">
        <AppIcon name="refresh" />
      </button>
    </div>
    <p v-if="error" class="records-message error" role="alert">{{ error }}</p>
    <p v-else-if="loading" class="records-message" role="status">Cargando registros…</p>
    <p v-else-if="!filtered.length" class="records-message">{{ rows.length ? 'No hay registros que coincidan con los filtros.' : 'Aún no hay registros.' }}</p>
    <div v-if="filtered.length" class="table-scroll">
      <table class="records-table">
        <caption class="sr-only">Registros de asesorías</caption>
        <thead><tr>
          <th scope="col">Matrícula</th><th scope="col">Alumno</th><th scope="col">Materia</th>
          <th v-if="role === 'admin'" scope="col">Maestro</th><th scope="col">Fecha y hora</th>
        </tr></thead>
        <tbody><tr v-for="r in filtered" :key="r.id">
          <td class="student-id">{{ r.studentId }}</td>
          <td>{{ r.studentName === r.studentId ? 'Sin nombre registrado' : r.studentName }}</td>
          <td><strong>{{ r.className }}</strong></td>
          <td v-if="role === 'admin'">{{ r.teacherName ?? 'Sin maestro asignado' }}</td>
          <td>{{ new Date(r.registeredAt).toLocaleString('es-MX') }}</td>
        </tr></tbody>
      </table>
    </div>
  </section>
</template>
