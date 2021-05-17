import {
  Apis,
  Login,
  ChainStore,
  ConnectionManager,
  TransactionBuilder,
  ChainConfig,
} from 'peerplaysjs-lib';
import BigNumber from 'bignumber.js';
import Immutable from 'immutable';
import Config from './Config';

const MAX_RECURSION_ATTEMPTS = 10;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const endpointsGist = 'https://api.github.com/gists/024a306a5dc41fd56bd8656c96d73fd0';

/**
 * Contains functions required to init, connect, reconnect, and obtain data from the Peerplays blockchain.
 *
 * @class PeerplaysService
 */
class PeerplaysService {
  constructor() {
    this.store = null;
    this.connectionStatusCallback = () => {};

    this.blockchainUrlIndex = 0;
    this.sortedList = [];
    this.peerplaysURLs = [];
    this.balancePrecision = 0;
    this.blockInterval = 0;
    this.asset = {};
  }

  /**
   * Initializes the connection.
   *
   * @memberof PeerplaysService
   */
  init(store) {
    const ConnectionCallback = () => {
      this.setDefaultRpcConnectionStatusCallback(value => {
        switch (value) {
          case 'error':
          case 'open':
            break;
          case 'reconnected':
          case 'closed':
            ChainStore.resetCache();
            this.init(store);
            break;
          // no default
        }
      });
    };

    this.store = store;

    ChainConfig.setPrefix(Config.isDev ? 'TEST' : 'PPY');
    ChainStore.setDispatchFrequency(this.blockInterval); // set the frequency of pulling blockchain data
    this.connectToBlockchain(ConnectionCallback)
      .then(() => {
        // Init the chainstore after we connect so that we can request object data from
        // the blockchain.
        ChainStore.init().catch(err => {
          console.error('error: ', err); // TODO: real error handling for production
        });
      })
      .then(() => {
        // sync with blockchain
        this.syncWithBlockchain()
          .then(synced => {
            if (synced === false) {
              console.warn('Sync failed: clock desync.');
              this.closeConnectionToBlockchain();
              this.delayedInit();
              return;
            }

            store.dispatch('getDynamicGlobalProperties');
          })
          .catch(() => {
            // disconnect since we are not synced
            this.closeConnectionToBlockchain();
            this.delayedInit();
          });
      })
      .catch(error => {
        // Fail to connect/ sync/ listen to software update, close connection to the blockchain
        console.error('Failed to connect to blockchain', error, new Error().stack);
        this.closeConnectionToBlockchain();
        this.delayedInit();
      });
  }

  delayedInit() {
    setTimeout(() => {
      this.init();
    }, 10000);
  }

  /**
   * Obtainis the full account of the user along with the balance.
   *
   * @param {string} accountName - Peerplays account name/id of the user.
   * @memberof PeerplaysService
   */
  getBalance(accountName) {
    this.getFullAccount(accountName)
      .then(account => {
        if (account) {
          return this.getBalanceByAsset(account.getIn(['balances']));
        }
        return 0;
      })
      .catch(err => {
        console.error(err);
      });
  }

  getBalanceByAsset(balance) {
    const asset = '1.3.0';

    for (let i = 0; i < balance.size; i++) {
      if (balance.getIn([i, 'asset_type']) === asset) {
        return this.formatBalance(balance.getIn([i, 'balance']));
      }
    }

    return '0'; // no asset match
  }

  formatBalance(unformatedBalance) {
    const { balancePrecision } = this;
    const balance = unformatedBalance / Math.pow(10, balancePrecision);

    return balance;
  }

  /**
   * Obtain list of active witnesses or testnet endpoints if in development mode.
   *
   * @returns {Promise} - Resolves promise if succesful, otherwise reject.
   * @memberof PeerplaysService
   */
  async getActiveWitnessEndpoints() {
    const clean = values => {
      const cleanedValues = values;

      for (let i = 0; i < values.length; i++) {
        cleanedValues[i] = cleanedValues[i].trim();
      }

      return cleanedValues;
    };

    this.peerplaysURLs = Config.elizabethEndpoints;

    if (!Config.isDev && !Config.usePeerplaysTestnet) {
      const res = await fetch(endpointsGist);
      const data = await res.json();
      const keys = Object.keys(data.files);

      // Loop over the keys, extract the endpoints and convert to an array.
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        const { content } = data.files[key];
        this.peerplaysURLs = clean(
          content
            .replace('const endpoints = [', '')
            .replace('];', '')
            .replace(/'/g, '')
            .split(','),
        );
      }
    }
  }

  /**
   * Reconnect to blockchain in case of a disconnect.
   *
   * @returns {Apis.instance}
   * @memberof PeerplaysService
   */
  reconnectToBlockchain() {
    // Increment the index for the next connection attempt
    if (this.sortedList.length > 1) {
      this.blockchainUrlIndex++;
    }

    const connectionString = this.sortedList[this.blockchainUrlIndex];
    return Apis.instance(connectionString, true)
      .init_promise.then(() => {
        console.info(
          `%cConnected to: ${connectionString}.`,
          'background: #222 color: green; font-size: large',
        );
      })
      .catch(() => {
        console.info(
          `%cConnection to: ${connectionString} failed.`,
          'background: #222; color: red; font-size: large',
        );

        return Promise.reject();
      });
  }

  /**
   * Connecting to Peerplays blockchain and initializing chainstore.
   *
   * @param {Function} connectionStatusCallback - Connection status callback function.
   * @returns {Function} Returns connection status callback function.
   * @memberof PeerplaysService
   */
  connectToBlockchain(connectionStatusCallback) {
    // Set connection status callback
    this.connectionStatusCallback = connectionStatusCallback;

    if (this.sortedList.length > 1) {
      return this.reconnectToBlockchain();
    }

    return this.getActiveWitnessEndpoints()
      .then(() => {
        const wsConnectionManager = new ConnectionManager({ urls: this.peerplaysURLs });
        return wsConnectionManager;
      })
      .then(connectionManager => {
        return connectionManager.sortNodesByLatency();
      })
      .then(list => {
        this.sortedList = list;
        const connectionString = list[this.blockchainUrlIndex];
        return Apis.instance(connectionString, true)
          .init_promise.then(res => {
            this.connectionStatusCallback(true);

            // Print out which blockchain we are connecting to
            console.debug('Connected to:', res[0] ? res[0].network_name : 'Undefined Blockchain');
          })
          .catch(err => {
            this.connectionStatusCallback(false);
            console.error('closing blockchain: ', err);
            // Close residue connection to blockchain
            this.closeConnectionToBlockchain();
            return Promise.reject();
          });
      });
  }

  /**
   * Close connection to blockchain and remove any related callbacks.
   *
   * @memberof PeerplaysService
   */
  closeConnectionToBlockchain() {
    // Close connection
    Apis.close();

    // Reset the index if we've gone past the end.
    if (this.blockchainUrlIndex >= this.peerplaysURLs.length) {
      this.blockchainUrlIndex = 0;
    }
  }

  /**
   * Request data from the Peerplays blockchain based on provided parameters required for the various calls.
   *
   * @param {string} apiPluginName - One of the apis that exist: `connect`, `close`, `db_api`, `network_api`, `history_api`, `crypto_api`, `bookie_api`, `setRpcConnectionStatusCallback`.
   * @param {string} methodName - Public methods available on Peerplays blockchain.
   * @param {Array} [params=[]] - Params required for different blockchain methods.
   * @returns {Immutable.Map} Of data retrieved.
   * @memberof PeerplaysService
   */
  callBlockchainApi(apiPluginName, methodName, params = []) {
    let apiPlugin;

    if (apiPluginName === 'db_api') {
      apiPlugin = Apis.instance().db_api();

      return apiPlugin
        .exec(methodName, params)
        .then(result => {
          return result;
        })
        .catch(err => {
          // Intercept and log
          console.error(
            `Error in calling ${apiPluginName}\nMethod: ${methodName}\nParams: ${JSON.stringify(
              params,
            )}\nError: `,
            err,
          );
          // Return an empty response rather than throwing an error.
          return {};
        });
    }
  }

  /**
   * Call the Peerplays blockchain `db_api` for information.
   * Route every call to blockchain db api through this function, so we can see the logging.
   *
   * @param {*} methodName - Public methods available on Peerplays blockchain.
   * @param {*} [params=[]] - Params required for different blockchain methods.
   * @returns {Immutable.Map}
   * @memberof PeerplaysService
   */
  callBlockchainDbApi(methodName, params = []) {
    return this.callBlockchainApi('db_api', methodName, params);
  }

  /**
   * Request information on the Peerplays blockchain by id.
   *
   * @param {string} id - ID of the peerplays blockchain to retrieve @example '1.3.1'.
   * @param {boolean} [force=false] - Force a result. TODO: check blockchain for certainty on this.
   * @param {number} [numRecursion=0] - Number of times to retry requesting.
   * @returns {Immutable.Map}
   * @memberof PeerplaysService
   */
  getObject(id, force = false, numRecursion = 0) {
    let num = numRecursion;
    return new Promise((resolve, reject) => {
      if (num > MAX_RECURSION_ATTEMPTS) {
        console.warn('[APP] MAX_RECURSION_ATTEMPTS Repository.getObject()');
        return resolve(null);
      }

      const object = ChainStore.getObject(id, force);

      if (object === null) {
        return resolve(object);
      }

      if (object) {
        return resolve(object);
      }

      setTimeout(() => {
        num += 1;
        this.getObject(id, force, ++num)
          .then(res => resolve(res))
          .catch(err => reject(err));
      }, 100);
    });
  }

  /**
   * Get the account data from the blockchain for the provided account name or account ID.
   *
   * @param {string} accountNameOrId - @example 'jibber232' or '1.2.334'.
   * @returns {Immutable.Map} FullAccount: contains user data retrieved from blockchain if it exists.
   * @memberof PeerplaysService
   */
  getFullAccount(accountNameOrId) {
    return this.callBlockchainDbApi('get_full_accounts', [[accountNameOrId], true]).then(result => {
      const fullAccount = result.getIn([0, 1]);
      // Return the full account
      return fullAccount;
    });
  }

  /**
   * Get the transfer transaction fee from the blockchain for the provided currency.
   *
   * @returns {number} TransferFee for the transactions.
   * @memberof PeerplaysService
   */
  getTransferFee() {
    return this.callBlockchainDbApi('get_required_fees', [[[0]], Config.sUSD]).then(result => {
      const transferFee = this.formatBalance(result.getIn([0, 'amount']));
      // Return the transfer fee
      return transferFee;
    });
  }

  /**
   * Create transaction with logged user's ppyAccountName and password.
   *
   * @param {string} peerplaysAccountUsername - Username for peerplays account.
   * @param {string} peerplaysAccountPassword - Password for peerplays account.
   * @param {string} depositAccountId - Account Id in which the amount has to be deposited.
   * @param {number} ppyAmount - Total transaction fee.
   * @returns {string} Stringify of transaction.
   * @memberof PeerplaysService
   */
  async createTransaction(
    peerplaysAccountUsername,
    peerplaysAccountPassword,
    depositAccountId,
    ppyAmount,
  ) {
    const x = new BigNumber(ppyAmount);
    const amount = x.shiftedBy(this.balancePrecision || 8);
    const peerplaysAccount = await this.getFullAccount(peerplaysAccountUsername);
    const peerplaysAccountId = peerplaysAccount.getIn(['account', 'id']);
    const tr = new TransactionBuilder();
    const keys = Login.generateKeys(
      peerplaysAccountUsername,
      peerplaysAccountPassword,
      ['owner', 'active'],
      IS_PRODUCTION ? 'PPY' : 'BTF',
    );

    try {
      tr.add_type_operation('transfer', {
        fee: {
          amount: 0,
          asset_id: Config.sUSD,
        },
        from: peerplaysAccountId,
        to: depositAccountId,
        amount: {
          amount: amount.toNumber(),
          asset_id: Config.sUSD,
        },
      });

      await tr.set_required_fees();
      tr.add_signer(keys.privKeys.active, keys.pubKeys.active);
    } catch (err) {
      throw err;
    }

    await tr.serialize();
    await tr.finalize();
    await tr.sign();

    return JSON.stringify(tr.toObject());
  }

  setDefaultRpcConnectionStatusCallback(callback) {
    return Apis.instance().setRpcConnectionStatusCallback(callback);
  }

  /**
   * Checks to see if the users system clocks matches the timestamp of the blockchain.
   *
   * @returns {boolean} - Boolean stating weather or not the users is synced.
   * @memberof PeerplaysService
   */
  syncWithBlockchain() {
    // Check if db api is ready
    const db_api = Apis.instance().db_api();

    if (!db_api) {
      return Promise.reject(
        new Error('Api not found, please ensure Apis from peerplaysjs-lib.ws is initialized first'),
      );
    }

    // Request object 2.1.0, 2.0.0, and the asset object.
    return this.callBlockchainDbApi('get_objects', [['2.1.0', '2.0.0', '1.3.0']]).catch(err => {
      return Promise.reject(err);
    });
  }
}

export default new PeerplaysService();
