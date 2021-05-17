import Vue from 'vue';
import router from '@/router';
import { idleDetector } from '@/main';
import { credentialsValid } from '@/helpers/auth';
import PeerplaysService from '@/helpers/PeerplaysService';

const state = {
  username: null,
  keys: {},
  account: {},
};

const mutations = {
  login(_state, { result, keys }) {
    Vue.set(_state, 'username', result[0]);
    Vue.set(_state, 'keys', keys);
    Vue.set(_state, 'account', result[1]);
  },
  logout(_state) {
    Vue.set(_state, 'username', null);
    Vue.set(_state, 'keys', {});
    Vue.set(_state, 'account', {});
  },
  loadAccount(_state, account) {
    Vue.set(_state, 'account', account);
  },
};

const actions = {
  login: async ({ commit, dispatch, rootState }, { username, keys }) => {
    const valid = await credentialsValid(username, keys);

    if (!valid) {
      throw new Error('Invalid credentials');
    }

    const result = await PeerplaysService.callBlockchainDbApi('get_full_accounts', [
      [username],
      false,
    ]);
    commit('login', { result: result[0], keys });

    idleDetector.start(rootState.settings.timeout * 60 * 1000, () => {
      idleDetector.stop();
      dispatch('logout');
    });
  },
  logout: ({ commit }) => {
    commit('logout');
    router.push('/');
  },
  loadAccount: async ({ commit, rootState }) => {
    const { username } = rootState.auth;
    const [account] = await PeerplaysService.callBlockchainDbApi('get_full_accounts', [
      [username],
      false,
    ]);
    commit('loadAccount', account);
  },
  sign: async ({ rootState }, { tx, authority }) => {
    const { keys } = rootState.auth;
    const auth = authority || 'active';
    tx.add_signer(keys.privKeys[auth], keys.pubKeys[auth]);
    await tx.serialize();
    await tx.finalize();
    await tx.sign();
    return tx;
  },
  broadcast: (context, tx) => tx.broadcast(),
};

export default {
  state,
  mutations,
  actions,
};
