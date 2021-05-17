import { TransactionHelper, Aes } from 'peerplaysjs-lib';
import PeerplaysService from './PeerplaysService';

export async function formatTransferOperation(op, keys) {
  const fromAcc = await PeerplaysService.callBlockchainDbApi('get_full_accounts', [
    [op[1].from],
    false,
  ]);
  const toAcc = await PeerplaysService.callBlockchainDbApi('get_full_accounts', [
    [op[1].to],
    false,
  ]);
  const amount = {
    amount: Math.round(Number(op[1].amount.split(' ')[0]) * Math.pow(10, 5)),
    asset_id: '1.3.0',
  };
  const nonce = TransactionHelper.unique_nonce_uint64();
  const encyrptedMessage =
    op[1].memo.length > 0
      ? Aes.encrypt_with_checksum(
          keys.privKeys.memo, // From Private Key
          toAcc[0][1].account.options.memo_key, // To Public Key
          nonce,
          op[1].memo,
        )
      : null;
  return [
    op[0],
    {
      fee: { amount: 0, asset_id: '1.3.0' },
      from: fromAcc[0][1].account.id,
      to: toAcc[0][1].account.id,
      amount,
      memo_data:
        op[1].memo.length > 0
          ? {
              from: keys.pubKeys.memo,
              to: toAcc[0][1].account.options.memo_key,
              nonce,
              message: encyrptedMessage,
            }
          : null,
    },
  ];
}

export async function formatOperation(op, keys) {
  switch (op[0]) {
    case 'transfer':
      return formatTransferOperation(op, keys);
    default:
      return null;
  }
}
