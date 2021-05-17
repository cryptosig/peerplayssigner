/* global chrome */
import { has } from 'lodash';
import operations from '@/helpers/operations.json';
import * as peerplaysuri from 'peerplays-uri';
import PeerplaysService from './PeerplaysService';

export const REQUEST_ID_PARAM = 'requestId';
const EXPIRE_TIME = 1000 * 60;

export const isChromeExtension = () =>
  window.chrome && window.chrome.runtime && window.chrome.runtime.id;

export const isWeb = () => !isChromeExtension();

export function jsonParse(input, fallback) {
  try {
    return JSON.parse(input);
  } catch (err) {
    return fallback || {};
  }
}

/** Parse error message from hived response */
export function getErrorMessage(error) {
  let errorMessage = '';
  if (has(error, 'stack[0].format')) {
    errorMessage = error.stack[0].format;
    if (has(error, 'stack[0].data')) {
      const { data } = error.stack[0];
      Object.keys(data).forEach(d => {
        errorMessage = errorMessage.split(`\${${d}}`).join(data[d]);
      });
    }
  } else if (error.message) {
    errorMessage = error.message;
  }
  return errorMessage;
}

export function getVestsToSP(properties) {
  return (
    parseFloat(properties.total_vesting_fund_steem) / parseFloat(properties.total_vesting_shares)
  );
}

function processValue(schema, key, value, { vestsToSP }) {
  const { type, defaultValue, maxLength } = schema[key];
  const realValue = !value && typeof defaultValue !== 'undefined' ? defaultValue : value;
  switch (type) {
    case 'amount':
      if (realValue.indexOf('VESTS') !== -1) return `${parseFloat(realValue).toFixed(6)} VESTS`;
      if (realValue.indexOf('HP') !== -1)
        return `${(parseFloat(realValue) / vestsToSP).toFixed(6)} VESTS`;
      if (realValue.indexOf('HIVE') !== -1) return `${parseFloat(realValue).toFixed(3)} HIVE`;
      if (realValue.indexOf('HBD') !== -1) return `${parseFloat(realValue).toFixed(3)} HBD`;
      return realValue;
    case 'int':
      return parseInt(realValue, 10);
    case 'bool':
      if (value === 'false' || value === false) return false;
      return realValue;
    case 'string':
      if (maxLength) return realValue.substring(0, Math.min(realValue.length, maxLength - 1));
      return realValue;
    default:
      return realValue;
  }
}

export function processTransaction(transaction, config) {
  const processed = { ...transaction };
  processed.tx.operations = transaction.tx.operations.map(([name, payload]) => {
    const processedPayload = Object.keys(operations[name].schema).reduce(
      (acc, key) => ({
        ...acc,
        [key]: processValue(operations[name].schema, key, payload[key], config),
      }),
      {},
    );
    return [name, processedPayload];
  });
  return processed;
}

export function formatNumber(number) {
  if (parseFloat(number.toFixed(6)) < 0.001) {
    return number.toFixed(6);
  }
  return number.toFixed(3);
}

export function buildSearchParams(route) {
  const keys = Object.keys(route.query);
  if (keys.length === 0) return '';
  const params = keys
    .filter(key => key !== REQUEST_ID_PARAM)
    .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(route.query[key])}`)
    .join('&');
  return `?${params}`;
}

export function signComplete(requestId, err, res) {
  if (!isChromeExtension()) return;
  chrome.runtime.sendMessage({
    type: 'signComplete',
    payload: {
      requestId,
      args: [err, res],
    },
  });
  window.close();
}

export function isValidUrl(string) {
  try {
    // eslint-disable-next-line no-new
    new URL(string);
    return true;
  } catch (e) {
    return false;
  }
}

export function getLowestAuthorityRequired(tx) {
  let authority;
  tx.operations.forEach(operation => {
    if (operations[operation[0]] && operations[operation[0]].authority) {
      if (operations[operation[0]].authority === 'owner') authority = 'owner';
      if (operations[operation[0]].authority === 'active') authority = 'active';
      if (operations[operation[0]].authority === 'posting' && authority !== 'active') {
        authority = 'posting';
      }
    }
  });
  return authority;
}

const b64uLookup = { '/': '_', _: '/', '+': '-', '-': '+', '=': '.', '.': '=' };

export const b64uEnc = str => btoa(str).replace(/(\+|\/|=)/g, m => b64uLookup[m]);

export const b64uDec = str => atob(str.replace(/(-|_|\.)/g, m => b64uLookup[m]));

export async function resolveTransaction(parsed, signer) {
  const props = await PeerplaysService.callBlockchainDbApi('get_dynamic_global_properties', [[]]);
  // resolve the decoded tx and params to a signable tx
  const { tx } = peerplaysuri.resolveTransaction(parsed.tx, parsed.params, {
    /* eslint-disable no-bitwise */
    ref_block_num: props.head_block_number & 0xffff,
    ref_block_prefix: Buffer.from(props.head_block_id, 'hex').readUInt32LE(4),
    expiration: new Date(Date.now() + EXPIRE_TIME).toISOString().slice(0, -5),
    signers: [signer],
    preferred_signer: signer,
  });
  tx.ref_block_num = parseInt(tx.ref_block_num, 10);
  tx.ref_block_prefix = parseInt(tx.ref_block_prefix, 10);

  return tx;
}
