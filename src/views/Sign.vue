<template>
  <div>
    <Header :title="title" />
    <div v-if="parsed && uriIsValid" class="p-4 after-header">
      <div class="container-sm mx-auto">
        <Error v-if="!loading && failed" :error="error" />
        <Confirmation v-if="!loading && !!transactionId" :id="transactionId" />
        <div v-if="!failed && !transactionId">
          <Operation
            v-for="(operation, key) in parsed.tx.operations"
            :operation="operation"
            :key="key"
          />
          <div class="flash flash-warn mb-4" v-if="parsed.params.callback">
            You are going to get redirected to
            <span class="link-color">{{ parsed.params.callback | parseUrl }}</span
            >.
          </div>
          <div class="flash flash-warn mb-4" v-if="username && hasRequiredKey === false">
            This transaction requires your <b>{{ authority }}</b> key.
          </div>
          <div class="mb-4">
            <router-link
              :to="{ name: 'login', query: { redirect: this.$route.fullPath, authority } }"
              class="btn btn-large btn-blue mr-2 mb-2"
              v-if="!username || hasRequiredKey === false"
            >
              Continue
            </router-link>
            <button
              type="submit"
              class="btn btn-large btn-success mr-2 mb-2"
              :disabled="loading"
              @click="handleSubmit"
              v-else
            >
              {{ parsed.params.no_broadcast ? 'Sign' : 'Approve' }}
            </button>
            <button class="btn btn-large mb-2" @click="handleReject">
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
    <div class="p-4 after-header" v-else>
      <div class="container-sm mx-auto flash flash-error mb-4">
        Oops, something went wrong. The signing URL provided is invalid.
      </div>
    </div>
  </div>
</template>

<script>
import * as peerplaysuri from 'peerplays-uri';
import { mapActions } from 'vuex';
import { TransactionBuilder } from 'peerplaysjs-lib';
import {
  isWeb,
  isChromeExtension,
  getVestsToSP,
  getLowestAuthorityRequired,
  processTransaction,
  resolveTransaction,
  buildSearchParams,
  signComplete,
  REQUEST_ID_PARAM,
} from '@/helpers/utils';
import { formatOperation } from '../helpers/operations';

export default {
  data() {
    return {
      parsed: null,
      uriIsValid: true,
      loading: false,
      transactionId: '',
      failed: false,
      error: false,
      isWeb: isWeb(),
      uri: `peerplays://sign/${this.$route.params.pathMatch}${buildSearchParams(this.$route)}`,
      requestId: this.$route.query[REQUEST_ID_PARAM],
      authority: this.$route.query.authority || 'active',
      hasRequiredKey: null,
    };
  },
  computed: {
    title() {
      let title = 'Confirm transaction';
      if (this.authority) title += ` (${this.authority})`;
      return title;
    },
    username() {
      return this.$store.state.auth.username;
    },
    config() {
      return {
        vestsToSP: getVestsToSP(this.$store.state.settings.properties),
      };
    },
  },
  mounted() {
    this.parseUri(this.uri);
    if (!this.authority && this.parsed && this.parsed.tx) {
      this.authority = getLowestAuthorityRequired(this.parsed.tx);
      this.hasRequiredKey = !!this.$store.state.auth.username;
    }
  },
  methods: {
    ...mapActions(['sign', 'broadcast']),
    parseUri(uri) {
      let parsed;
      try {
        parsed = peerplaysuri.decode(uri);
      } catch (err) {
        console.error(err);
        this.uriIsValid = false;
      }
      this.parsed = processTransaction(parsed, this.config);
    },
    async handleSubmit() {
      this.loading = true;
      let sig = null;
      const tx = new TransactionBuilder();
      let result = null;
      let signedTx = null;

      try {
        const tr = await resolveTransaction(this.parsed, this.$store.state.auth.username);
        for (let i = 0; i < tr.operations.length; i++) {
          const op = tr.operations[i];
          const formattedOp = await formatOperation(op, this.$store.state.auth.keys);
          tx.add_type_operation(formattedOp[0], formattedOp[1]);
        }

        await tx.set_required_fees();
        signedTx = await this.sign({ tx, authority: this.authority });
        [sig] = signedTx.signatures;
      } catch (err) {
        console.error('Failed to resolve and sign transaction', err);
      }

      if (!sig) {
        this.transactionId = '';
        this.failed = true;
        this.loading = false;
        return;
      }

      if (!this.parsed.params.no_broadcast) {
        try {
          [result] = await signedTx.broadcast();
          this.transactionId = result.id;
          this.failed = false;

          if (this.requestId) {
            signComplete(this.requestId, null, { result });
          }
        } catch (err) {
          this.error = err;
          console.error('Failed to broadcast transaction', err);
          this.transactionId = '';
          this.failed = true;

          if (this.requestId) {
            signComplete(this.requestId, err, null);
          }
        }
      }

      // TODO: Handle Chrome extension & desktop app redirect.
      if (result && this.parsed.params.callback && isWeb()) {
        window.location = peerplaysuri.resolveCallback(this.parsed.params.callback, {
          sig,
          id: result.id || undefined,
          block: result.block_num || undefined,
          txn: result.txn_num || undefined,
        });
      } else {
        this.loading = false;
      }
    },
    handleReject() {
      if (this.requestId) {
        signComplete(this.requestId, 'Request rejected', null);
      }
      if (!isChromeExtension()) {
        this.$router.push('/');
      }
    },
  },
};
</script>
