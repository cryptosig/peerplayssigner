import { version } from '../../package.json';

const isDev = process.env.NODE_ENV === 'development';
const { VUE_APP_BLOCKCHAIN_USE_TESTNET, VUE_APP_BLOCKCHAIN_ENDPOINTS } = process.env;

/**
 * @namespace Config
 */
const Config = {
  /**
   * @type {boolean}
   * @memberof Config
   */
  isDev,
  /**
   * The current version of the app pulled from package.json.
   *
   * @type {string}
   */
  version,

  /**
   * Specifies whether testnet or mainnet endpoints are used for the Peerplays connection.
   */
  usePeerplaysTestnet: VUE_APP_BLOCKCHAIN_USE_TESTNET === 'true',

  /**
   * Endpoints for elizabeth testnet. Used for Peerplays Global Login.
   *
   * @type {string[]}
   * @memberof Config
   */
  elizabethEndpoints: VUE_APP_BLOCKCHAIN_ENDPOINTS.replace(' ', '').split(','),
};

export default Config;
