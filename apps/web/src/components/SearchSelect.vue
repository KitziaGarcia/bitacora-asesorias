<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, useId } from 'vue';

const props = defineProps<{ label: string; options: { value: string; label: string }[] }>();
const model = defineModel<string>({ required: true });
const id = useId();
const open = ref(false);
const query = ref('');
const trigger = ref<HTMLButtonElement>();
const search = ref<HTMLInputElement>();
const menu = ref<HTMLDivElement>();
const normalize = (text: string) => text.toLocaleLowerCase('es').normalize('NFD').replace(/\p{M}/gu, '');
const selected = computed(() => props.options.find(option => option.value === model.value)?.label ?? 'Seleccionar');
const results = computed(() => props.options.filter(option => normalize(option.label).includes(normalize(query.value.trim()))));

async function toggle() {
  if (open.value) {
    close();
    return;
  }
  query.value = '';
  menu.value?.showPopover();
  open.value = true;
  positionMenu();
  await nextTick();
  search.value?.focus({ preventScroll: true });
}

function positionMenu() {
  if (!open.value || !trigger.value || !menu.value) return;
  const rect = trigger.value.getBoundingClientRect();
  const below = window.innerHeight - rect.bottom - 12;
  Object.assign(menu.value.style, {
    left: `${rect.left}px`,
    width: `${rect.width}px`,
    top: `${rect.bottom + 6}px`,
    maxHeight: `${Math.max(0, below)}px`,
  });
}

function close(restoreFocus = true) {
  if (!open.value) return;
  open.value = false;
  menu.value?.hidePopover();
  if (restoreFocus) trigger.value?.focus({ preventScroll: true });
}

function choose(value: string) {
  model.value = value;
  close();
}

function onFocusOut(event: FocusEvent) {
  const root = event.currentTarget as HTMLElement;
  if (!root.contains(event.relatedTarget as Node | null)) close(false);
}

onMounted(() => {
  window.addEventListener('resize', positionMenu);
  window.addEventListener('scroll', positionMenu);
});
onUnmounted(() => {
  window.removeEventListener('resize', positionMenu);
  window.removeEventListener('scroll', positionMenu);
});
</script>

<template>
  <div class="search-select" @focusout="onFocusOut" @keydown.esc.stop.prevent="close()">
    <span :id="`${id}-label`" class="filter-label">{{ label }}</span>
    <button
      ref="trigger"
      class="input search-select-trigger"
      type="button"
      :aria-expanded="open"
      :aria-controls="`${id}-options`"
      :aria-labelledby="`${id}-label ${id}-value`"
      @mousedown.prevent
      @click="toggle"
    >
      <span :id="`${id}-value`">{{ selected }}</span><span class="select-chevron" aria-hidden="true"></span>
    </button>
    <div ref="menu" :id="`${id}-options`" class="search-select-menu" popover="auto" @toggle="open = $event.newState === 'open'">
      <input
        ref="search"
        v-model="query"
        class="input"
        type="search"
        :aria-label="`Buscar en ${label}`"
        placeholder="Buscar…"
        @keydown.enter.prevent="results[0] && choose(results[0].value)"
      />
      <ul v-if="results.length">
        <li v-for="option in results" :key="option.value">
          <button type="button" :aria-pressed="model === option.value" @mousedown.prevent @click="choose(option.value)">{{ option.label }}</button>
        </li>
      </ul>
      <p v-else class="search-select-empty" role="status">Sin coincidencias</p>
    </div>
  </div>
</template>
