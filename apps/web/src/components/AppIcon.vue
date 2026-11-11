<script setup lang="ts">
defineProps<{ name: 'student' | 'teacher' | 'admin' | 'home' | 'arrow' | 'book' | 'history' | 'logout' | 'qr' | 'check' | 'menu' | 'filter-clear' | 'refresh' }>();
const paths = {
  'filter-clear': ['M3 4h18l-7 8v4l-4 2v-6L3 4Z', 'm17 17 5 5', 'm22 17-5 5'],
  refresh: ['M20 7a8 8 0 0 0-14-2L3 8', 'M3 3v5h5', 'M4 17a8 8 0 0 0 14 2l3-3', 'M21 21v-5h-5'],
  menu: ['M4 6h16', 'M4 12h16', 'M4 18h16'],
  admin: ['M12 22s7-3 7-10V5l-7-3-7 3v7c0 7 7 10 7 10Z', 'm9 12 2 2 4-4'],
  student: ['m2 8 10-5 10 5-10 5L2 8Z', 'M6 10v6c3 3 9 3 12 0v-6', 'M22 8v7'],
  teacher: ['M10 3h11v13H10', 'M14 7h4', 'M14 11h4', 'M9 8a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z', 'M2 21v-5a4 4 0 0 1 8 0v5', 'M17 16v5', 'M14 21h6'],
  home: ['m3 10 9-7 9 7', 'M5 9v12h14V9', 'M9 21v-8h6v8'],
  arrow: ['M4 12h16', 'm14 6 6 6-6 6'],
  book: ['M12 5c-3-2-7-2-10-1v15c3-1 7-1 10 1 3-2 7-2 10-1V4c-3-1-7-1-10 1Z', 'M12 5v15'],
  history: ['M3 11a9 9 0 1 1 2 7', 'M3 4v7h7', 'M12 7v5l3 2'],
  logout: ['M9 4H4v16h5', 'M9 12h12', 'm16 7 5 5-5 5'],
  qr: ['M3 3h6v6H3Z', 'M15 3h6v6h-6Z', 'M3 15h6v6H3Z', 'M15 15h3v3h3v3h-6v-6Z', 'M21 12v3', 'M12 3v3', 'M3 12h6', 'M12 12v9'],
  check: ['m5 12 4 4L19 6'],
};
</script>

<template>
  <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path v-for="(d, index) in paths[name]" :key="index" :d="d" /></svg>
</template>
