<template>
  <v-btn :loading="props.loading" :disabled="props.loading" class="mt-2" block c>
    <slot></slot>
  </v-btn>
</template>

<script setup lang="ts">
interface Props {
  loading?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
})
</script>
