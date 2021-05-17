/* eslint-disable import/prefer-default-export */
import PeerplaysService from './PeerplaysService';

export async function credentialsValid(username, keys) {
  const publicKey = keys.pubKeys.active;
  const fullAccounts = await PeerplaysService.callBlockchainDbApi('get_full_accounts', [
    [username],
    false,
  ]);

  if (fullAccounts) {
    return fullAccounts.find(fullAccount => {
      // eslint-disable-next-line camelcase
      return fullAccount[1].account.active.key_auths.find(key_auth => {
        return key_auth[0] === publicKey;
      });
    });
  }

  return undefined;
}
