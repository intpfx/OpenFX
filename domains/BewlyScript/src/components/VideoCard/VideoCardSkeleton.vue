<script setup lang="ts">
defineProps<{
  horizontal?: boolean
  hasTag?: boolean
}>()
</script>

<template>
  <!-- Video Card Skeleton -->
  <div
    v-if="!horizontal"
    mb-3 pointer-events-none select-none
    style="aspect-ratio: 11 / 10;"
  >
    <div aspect-video bg="$bew-skeleton" rounded="$bew-radius" style="aspect-ratio: 16 / 9;" />
    <div flex="~ col gap-2" mt-2>
      <div flex="~ gap-1 justify-between items-start" w="full">
        <div flex="~ col gap-2" w="[calc(100%-40px)]">
          <div w-full h-5 bg="$bew-skeleton" rounded-4px />
          <div w="3/4" h-5 bg="$bew-skeleton" rounded-4px />
        </div>
        <div shrink-0 w-8 h-8 rounded="1/2" bg="$bew-skeleton" />
      </div>

      <div flex="~ gap-2 items-center" w="full" mt-1>
        <div w="34px" h="34px" rounded="1/2" bg="$bew-skeleton" shrink-0 />
        <div flex="~ col gap-1" w="[calc(100%-50px)]">
          <div w="60%" h-3 bg="$bew-skeleton" rounded-4px />
          <div w="80%" h-3 bg="$bew-skeleton" rounded-4px />
        </div>
      </div>
    </div>
  </div>

  <!-- Video Card Skeleton (Horizontal) -->
  <div
    v-else
    flex="~ gap-6"
    mb-3 pointer-events-none select-none
    style="contain: layout; min-height: 180px;"
  >
    <!-- Cover -->
    <div
      :class="horizontal ? 'horizontal-card-cover' : 'vertical-card-cover'"
      shrink-0 aspect-video h-fit bg="$bew-skeleton"
      rounded="$bew-radius"
      style="aspect-ratio: 16 / 9;"
    />
    <!-- Other Information -->
    <div w-full mt-0 flex="~ col gap-2">
      <div flex="~ gap-1 justify-between items-start" w="full">
        <div w-full h-5 bg="$bew-skeleton" rounded-4px />
        <div shrink-0 w-8 h-8 rounded="1/2" bg="$bew-skeleton" />
      </div>

      <div flex="~ gap-2 items-center" w="full" mt-2>
        <div w="30px" h="30px" rounded="1/2" bg="$bew-skeleton" shrink-0 />
        <div flex="~ col gap-1" w="[calc(100%-46px)]">
          <div w="60%" h-3 bg="$bew-skeleton" rounded-4px />
          <div w="80%" h-3 bg="$bew-skeleton" rounded-4px />
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.horizontal-card-cover {
  --uno: "xl:w-280px lg:w-250px md:w-200px w-200px";
}

.vertical-card-cover {
  --uno: "w-full";
}
</style>
