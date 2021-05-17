<template>
  <div id="app" :class="{ 'app--extension': isExtension }">
    <template v-if="loaded">
      <router-view />
    </template>
    <VueLoadingIndicator v-else class="overlay fixed big" />
  </div>
</template>

<script>
import { isChromeExtension } from '@/helpers/utils';
import PeerplaysService from '@/helpers/PeerplaysService';

export default {
  data() {
    return {
      initialized: false,
    };
  },
  computed: {
    loaded() {
      return !!this.$store.state.settings.properties.head_block_number;
    },
    isExtension() {
      return isChromeExtension();
    },
  },
  created() {
    PeerplaysService.init(this.$store);
  },
  beforeUpdate() {
    if (this.initialized) return;

    this.initialized = true;
  },
};
</script>

<style scoped lang="less">
@import './vars';

.content {
  position: relative;
  left: 0;
  transition: left 0.3s;
}
</style>
