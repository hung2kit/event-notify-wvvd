<script setup lang="ts">
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import TextAlign from '@tiptap/extension-text-align';
import { FontSize, TextStyle } from '@tiptap/extension-text-style';
import StarterKit from '@tiptap/starter-kit';
import { EditorContent, useEditor, VueNodeViewRenderer } from '@tiptap/vue-3';
import {
  IconAlignCenter,
  IconAlignJustified,
  IconAlignLeft,
  IconAlignRight,
  IconBold,
  IconItalic,
  IconLink,
  IconList,
  IconListNumbers,
  IconPhoto,
  IconUnderline,
} from '@tabler/icons-vue';
import { computed, ref, watch } from 'vue';
import { fileToEditorImage } from '../lib/image';
import ResizableImageView from './ResizableImageView.vue';

const model = defineModel<string>({ required: true });
const props = defineProps<{ disabled?: boolean }>();
const fileInput = ref<HTMLInputElement | null>(null);
const imageError = ref('');

const FONT_SIZES = [
  { value: '12px', label: 'Nhỏ' },
  { value: '', label: 'Thường' },
  { value: '16px', label: 'Vừa' },
  { value: '18px', label: 'Lớn' },
  { value: '22px', label: 'Rất lớn' },
  { value: '28px', label: 'Tiêu đề' },
];
const ALIGNMENTS = [
  { value: 'left', label: 'Căn trái', icon: IconAlignLeft },
  { value: 'center', label: 'Căn giữa', icon: IconAlignCenter },
  { value: 'right', label: 'Căn phải', icon: IconAlignRight },
  { value: 'justify', label: 'Căn đều hai bên', icon: IconAlignJustified },
] as const;

const ResizableImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (element) => {
          const width = element.getAttribute('width');
          return width ? Number(width) : null;
        },
        renderHTML: (attributes) => (attributes.width ? { width: attributes.width } : {}),
      },
      alt: {
        default: '',
      },
    };
  },
  addNodeView() {
    return VueNodeViewRenderer(ResizableImageView);
  },
}).configure({
  allowBase64: true,
  inline: false,
});

const editor = useEditor({
  content: model.value || '',
  editable: !props.disabled,
  extensions: [
    StarterKit.configure({
      heading: false,
      code: false,
      codeBlock: false,
      blockquote: false,
      horizontalRule: false,
      strike: false,
      link: false,
    }),
    Link.configure({
      openOnClick: false,
      autolink: true,
      protocols: ['http', 'https', 'mailto'],
    }),
    TextStyle,
    FontSize,
    TextAlign.configure({
      types: ['paragraph'],
      alignments: ['left', 'center', 'right', 'justify'],
    }),
    ResizableImage,
  ],
  editorProps: {
    handlePaste(_view, event) {
      const files = [...(event.clipboardData?.files ?? [])].filter((file) =>
        file.type.startsWith('image/'),
      );
      if (!files.length || props.disabled) return false;
      event.preventDefault();
      void insertFiles(files);
      return true;
    },
    handleDrop(_view, event) {
      const files = [...(event.dataTransfer?.files ?? [])].filter((file) =>
        file.type.startsWith('image/'),
      );
      if (!files.length || props.disabled) return false;
      event.preventDefault();
      void insertFiles(files);
      return true;
    },
  },
  onUpdate: ({ editor: current }) => {
    model.value = current.getHTML();
  },
});

watch(
  () => props.disabled,
  (disabled) => editor.value?.setEditable(!disabled),
);

const fontSize = computed(() => {
  const value = editor.value?.getAttributes('textStyle').fontSize as string | undefined;
  return FONT_SIZES.some((size) => size.value === value) ? (value ?? '') : '';
});

function setFontSize(value: string) {
  const current = editor.value;
  if (!current) return;
  if (value) current.chain().focus().setFontSize(value).run();
  else current.chain().focus().unsetFontSize().run();
}

function isAligned(value: string): boolean {
  const current = editor.value;
  if (!current) return false;
  if (value === 'left') {
    return (
      current.isActive({ textAlign: 'left' }) ||
      !['center', 'right', 'justify'].some((other) => current.isActive({ textAlign: other }))
    );
  }
  return current.isActive({ textAlign: value });
}

async function insertFiles(files: File[]) {
  const current = editor.value;
  if (!current || props.disabled) return;
  imageError.value = '';
  for (const file of files) {
    try {
      const image = await fileToEditorImage(file);
      current
        .chain()
        .focus()
        .insertContent({
          type: 'image',
          attrs: { src: image.src, width: image.width, alt: file.name },
        })
        .run();
    } catch (error) {
      imageError.value = error instanceof Error ? error.message : 'Không chèn được ảnh';
    }
  }
}

function pickImage() {
  imageError.value = '';
  fileInput.value?.click();
}

function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = [...(input.files ?? [])];
  input.value = '';
  void insertFiles(files);
}

function setLink() {
  const current = editor.value;
  if (!current) return;
  const previous = current.getAttributes('link').href as string | undefined;
  const next = window.prompt('Nhập địa chỉ liên kết', previous ?? 'https://');
  if (next === null) return;
  if (!next.trim()) {
    current.chain().focus().unsetLink().run();
    return;
  }
  current.chain().focus().extendMarkRange('link').setLink({ href: next.trim() }).run();
}
</script>

<template>
  <div class="editor tall">
    <div
      v-if="editor && !disabled"
      class="editor-bar"
      role="toolbar"
      aria-label="Định dạng nội dung"
    >
      <select
        class="editor-size"
        aria-label="Cỡ chữ"
        :value="fontSize"
        @change="setFontSize(($event.target as HTMLSelectElement).value)"
      >
        <option v-for="size in FONT_SIZES" :key="size.label" :value="size.value">
          {{ size.label }}
        </option>
      </select>
      <span class="editor-sep" aria-hidden="true"></span>
      <button
        type="button"
        :class="{ on: editor.isActive('bold') }"
        aria-label="Đậm"
        title="Đậm"
        @click="editor.chain().focus().toggleBold().run()"
      >
        <IconBold :size="16" />
      </button>
      <button
        type="button"
        :class="{ on: editor.isActive('italic') }"
        aria-label="Nghiêng"
        title="Nghiêng"
        @click="editor.chain().focus().toggleItalic().run()"
      >
        <IconItalic :size="16" />
      </button>
      <button
        type="button"
        :class="{ on: editor.isActive('underline') }"
        aria-label="Gạch chân"
        title="Gạch chân"
        @click="editor.chain().focus().toggleUnderline().run()"
      >
        <IconUnderline :size="16" />
      </button>
      <span class="editor-sep" aria-hidden="true"></span>
      <button
        v-for="align in ALIGNMENTS"
        :key="align.value"
        type="button"
        :class="{ on: isAligned(align.value) }"
        :aria-label="align.label"
        :title="align.label"
        @click="editor.chain().focus().setTextAlign(align.value).run()"
      >
        <component :is="align.icon" :size="16" />
      </button>
      <span class="editor-sep" aria-hidden="true"></span>
      <button
        type="button"
        :class="{ on: editor.isActive('bulletList') }"
        aria-label="Danh sách"
        title="Danh sách"
        @click="editor.chain().focus().toggleBulletList().run()"
      >
        <IconList :size="16" />
      </button>
      <button
        type="button"
        :class="{ on: editor.isActive('orderedList') }"
        aria-label="Danh sách số"
        title="Danh sách số"
        @click="editor.chain().focus().toggleOrderedList().run()"
      >
        <IconListNumbers :size="16" />
      </button>
      <span class="editor-sep" aria-hidden="true"></span>
      <button
        type="button"
        :class="{ on: editor.isActive('link') }"
        aria-label="Liên kết"
        title="Liên kết"
        @click="setLink"
      >
        <IconLink :size="16" />
      </button>
      <button type="button" aria-label="Chèn ảnh" title="Chèn ảnh" @click="pickImage">
        <IconPhoto :size="16" />
      </button>
      <input
        ref="fileInput"
        class="sr-only"
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        multiple
        @change="onFileChange"
      />
    </div>
    <EditorContent :editor="editor" />
    <p v-if="!disabled" class="editor-hint">
      Chèn ảnh từ thanh công cụ, dán (Ctrl/Cmd+V) hoặc kéo thả vào khung. Bấm ảnh rồi kéo góc để thu
      phóng.
    </p>
    <div v-if="imageError" class="err">{{ imageError }}</div>
  </div>
</template>
