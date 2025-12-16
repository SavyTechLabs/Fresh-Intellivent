const crypto = require('crypto');

class KeyStore {
  constructor(homey) {
    this.homey = homey;
    this.algorithm = 'aes-256-gcm';
    this.secret = this._getAppSecret();
  }

  _getAppSecret() {
    // In a real scenario, this should be a persistent random secret generated once per app install.
    // For now, we'll use a fixed string or retrieve/create one from ManagerSettings.
    let secret = this.homey.settings.get('app_secret');
    if (!secret) {
      secret = crypto.randomBytes(32).toString('hex');
      this.homey.settings.set('app_secret', secret);
    }
    return Buffer.from(secret, 'hex');
  }

  async save(deviceId, keyData) {
    const iv = crypto.randomBytes(16);
    const salt = crypto.randomBytes(16);
    
    // Derive key using scrypt
    const key = await new Promise((resolve, reject) => {
      crypto.scrypt(this.secret, salt, 32, (err, derivedKey) => {
        if (err) reject(err);
        else resolve(derivedKey);
      });
    });

    const cipher = crypto.createCipheriv(this.algorithm, key, iv);
    let encrypted = cipher.update(JSON.stringify(keyData), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');

    const storageData = {
      iv: iv.toString('hex'),
      salt: salt.toString('hex'),
      authTag: authTag,
      content: encrypted,
      createdAt: Date.now()
    };

    // Store in device settings or global settings? 
    // The prompt implies a KeyStore, usually global or per device.
    // We'll use a global store keyed by deviceId for now, or let the caller handle storage.
    // To follow the prompt "Store ... via KeyStore.save()", I'll assume KeyStore manages persistence.
    // I'll use ManagerSettings with a prefix.
    this.homey.settings.set(`key_${deviceId}`, storageData);
  }

  async load(deviceId) {
    const data = this.homey.settings.get(`key_${deviceId}`);
    if (!data) return null;

    const { iv, salt, authTag, content } = data;

    const key = await new Promise((resolve, reject) => {
      crypto.scrypt(this.secret, Buffer.from(salt, 'hex'), 32, (err, derivedKey) => {
        if (err) reject(err);
        else resolve(derivedKey);
      });
    });

    const decipher = crypto.createDecipheriv(this.algorithm, key, Buffer.from(iv, 'hex'));
    decipher.setAuthTag(Buffer.from(authTag, 'hex'));

    let decrypted = decipher.update(content, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return JSON.parse(decrypted);
  }

  async delete(deviceId) {
    this.homey.settings.unset(`key_${deviceId}`);
  }
}

module.exports = KeyStore;
