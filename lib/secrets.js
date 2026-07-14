const PROTECTED_SECRET_PREFIX = 'safe:v1:';
const LEGACY_SECRET_PREFIX = 'plain:v1:';

function createSecretStore(safeStorage) {
  function isProtectedSecret(value) {
    return typeof value === 'string' && (
      value.startsWith(PROTECTED_SECRET_PREFIX) ||
      value.startsWith(LEGACY_SECRET_PREFIX)
    );
  }

  function protectSecret(secret) {
    const value = String(secret || '');
    if (!value) return '';
    if (isProtectedSecret(value)) return value;
    if (safeStorage.isEncryptionAvailable()) {
      return PROTECTED_SECRET_PREFIX + safeStorage.encryptString(value).toString('base64');
    }
    return LEGACY_SECRET_PREFIX + Buffer.from(value, 'utf8').toString('base64');
  }

  function unprotectSecret(secret) {
    const value = String(secret || '');
    if (!value) return '';
    if (value.startsWith(PROTECTED_SECRET_PREFIX)) {
      const encrypted = Buffer.from(value.slice(PROTECTED_SECRET_PREFIX.length), 'base64');
      return safeStorage.decryptString(encrypted);
    }
    if (value.startsWith(LEGACY_SECRET_PREFIX)) {
      return Buffer.from(value.slice(LEGACY_SECRET_PREFIX.length), 'base64').toString('utf8');
    }
    return value;
  }

  return {
    isProtectedSecret,
    protectSecret,
    unprotectSecret,
    isEncryptionAvailable: () => safeStorage.isEncryptionAvailable()
  };
}

module.exports = {
  PROTECTED_SECRET_PREFIX,
  LEGACY_SECRET_PREFIX,
  createSecretStore
};
