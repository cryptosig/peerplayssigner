<template>
  <div class="hero height-full">
    <Center>
      <span class="logo iconfont icon-hivesigner" />
      <h4 class="m-0">peerplayssigner</h4>
      <div class="mt-4 mb-7">
        <h1 class="mb-6">You're in control of your keys.</h1>
        <p>
          Peerplayssigner neither stores nor has access to your private keys.
        </p>
      </div>
      <Footer>This service is brought to you by Bitcoinsig witness</Footer>
    </Center>
  </div>
</template>

<script>
import pkg from '@/../package.json';

export default {
  data() {
    return {
      pkg,
    };
  },
};
</script>

<style scoped lang="less">
.icon-chrome,
.icon-desktop-windows {
  font-size: 28px;
  vertical-align: -4px;
}
</style>
