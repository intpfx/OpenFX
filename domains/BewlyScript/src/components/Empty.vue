<script setup lang="ts">
const props = defineProps<{
  description?: string
}>()
</script>

<template>
  <div flex="~ col gap-4" justify="center" items="center">
    <div class="empty-css-illustration" aria-hidden="true">
      <span />
    </div>
    <span v-if="props.description" text="$bew-text-3">{{ props.description }}</span>
    <slot />
  </div>
</template>

<style scoped lang="scss">
.empty-css-illustration {
  position: relative;
  width: 168px;
  height: 118px;
  color: var(--bew-text-3);
}

.empty-css-illustration::before {
  position: absolute;
  inset: 24px 18px 18px;
  content: "";
  background: linear-gradient(180deg, rgb(255 255 255 / 0.16), transparent), var(--bew-fill-1);
  border: 2px solid var(--bew-fill-3);
  border-radius: 18px;
  box-shadow: 0 14px 34px rgb(0 0 0 / 0.08);
}

.empty-css-illustration::after {
  position: absolute;
  right: 26px;
  bottom: 26px;
  left: 26px;
  height: 18px;
  content: "";
  background: var(--bew-fill-2);
  border: 2px solid var(--bew-fill-3);
  border-radius: 999px;
}

.empty-css-illustration > span {
  position: absolute;
  top: 40px;
  left: 50%;
  width: 54px;
  height: 54px;
  border: 3px solid currentcolor;
  border-radius: 999px;
  opacity: 0.42;
  transform: translateX(-50%) rotate(-10deg);
}

.empty-css-illustration > span::before,
.empty-css-illustration > span::after {
  position: absolute;
  top: 24px;
  left: 9px;
  width: 32px;
  height: 3px;
  content: "";
  background: currentcolor;
  border-radius: 999px;
}

.empty-css-illustration > span::before {
  transform: rotate(45deg);
}

.empty-css-illustration > span::after {
  transform: rotate(-45deg);
}
</style>
