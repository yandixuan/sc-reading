<script setup lang="ts">
defineProps<{
  icon?: string
  url: string
  title?: string

}>()
</script>

<template>
  <a :href="url" class="select-none decoration-none! cursor-pointer outline-0">
    <div
      class="flex items-center py-3px
      hover:(bg-[rgba(53,53,47,0.08)] dark:bg-[rgba(255,255,255,0.055)])"
    >
      <div class="relative h-24px w-24px m-r-4px" :class="[icon]" />
      <div
        class="leading-[1.3] text-truncate font-500
        border-b-1 border-b-solid
      border-b-[rgba(55,53,47,0.16)]
      dark:border-b-[rgba(255,255,255,0.13)]"
      >
        {{ title }}
      </div>
    </div>
  </a>
</template>
