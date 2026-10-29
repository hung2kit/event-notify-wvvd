<script setup lang="ts">
import { NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3';
import { computed, onBeforeUnmount, ref } from 'vue';

const props = defineProps(nodeViewProps);

const width = computed(() => {
  const value = Number(props.node.attrs.width);
  return Number.isFinite(value) && value > 0 ? value : undefined;
});

const dragging = ref(false);

function startResize(event: PointerEvent) {
  if (!props.editor.isEditable) return;
  event.preventDefault();
  event.stopPropagation();
  const startX = event.clientX;
  const startWidth =
    width.value ?? (event.currentTarget as HTMLElement).previousElementSibling?.clientWidth ?? 320;
  dragging.value = true;

  function onMove(move: PointerEvent) {
    const next = Math.max(80, Math.min(960, Math.round(startWidth + (move.clientX - startX))));
    props.updateAttributes({ width: next });
  }

  function onUp() {
    dragging.value = false;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
  }

  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
}

onBeforeUnmount(() => {
  dragging.value = false;
});
</script>

<template>
  <NodeViewWrapper
    as="div"
    class="editor-image"
    :class="{ selected: selected, dragging }"
    data-drag-handle
  >
    <img :src="node.attrs.src" :alt="node.attrs.alt || ''" :width="width" draggable="false" />
    <button
      v-if="editor.isEditable && selected"
      type="button"
      class="editor-image-handle"
      aria-label="Thu phóng ảnh"
      @pointerdown="startResize"
    />
  </NodeViewWrapper>
</template>
