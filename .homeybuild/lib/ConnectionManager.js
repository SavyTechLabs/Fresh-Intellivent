const Homey = require('homey');
const KeyStore = require('./KeyStore');

const UUID_AUTH = '4cad343a-209a-40b7-b911-4d9b3df569b2';

class ConnectionManager {
  constructor(homey, macAddress) {
    this.homey = homey;
    this.macAddress = macAddress;
    this.peripheral = null;
    this.isConnected = false;
    this.connectPromise = null;
    this.keyStore = new KeyStore(homey);
    this.backoff = 1000;
    this.maxBackoff = 60000;
    this.connectionTimeout = null;
  }

  async getPeripheral() {
    if (this.peripheral) return this.peripheral;
    this.peripheral = await this.homey.ble.find(this.macAddress);
    return this.peripheral;
  }

  async connect() {
    if (this.isConnected) return;
    if (this.connectPromise) return this.connectPromise;

    this.connectPromise = (async () => {
      try {
        const peripheral = await this.getPeripheral();
        
        if (peripheral.state !== 'connected') {
          await peripheral.connect();
        }

        this.isConnected = true;
        this.backoff = 1000; // Reset backoff on successful connection
        
        // Authenticate after connection
        // await this.authenticate(); // Disabled for read-only mode

        peripheral.once('disconnect', () => {
          this.isConnected = false;
          this.peripheral = null;
          this.connectPromise = null;
          this.homey.emit('disconnect', this.macAddress);
        });

      } catch (err) {
        this.isConnected = false;
        this.connectPromise = null;
        this.peripheral = null; // Force re-find on error
        
        // Exponential backoff
        const delay = this.backoff;
        this.backoff = Math.min(this.backoff * 2, this.maxBackoff);
        
        console.error(`Connection failed for ${this.macAddress}, retrying in ${delay}ms:`, err);
        await new Promise(resolve => setTimeout(resolve, delay));
        
        // Retry
        return this.connect();
      }
    })();

    return this.connectPromise;
  }

  async disconnect() {
    try {
        if (this.peripheral) {
            await this.peripheral.disconnect();
        } else {
            // Try to find and disconnect even if we don't have the reference
            const peripheral = await this.homey.ble.find(this.macAddress).catch(() => null);
            if (peripheral) {
                await peripheral.disconnect();
            }
        }
    } catch (err) {
        // Ignore disconnect errors
    }
    this.isConnected = false;
    this.connectPromise = null;
  }

  async authenticate() {
    // Retrieve auth code from KeyStore
    // We assume the deviceId used in KeyStore is the macAddress (or a sanitized version of it)
    // The driver should ensure the key is saved with the correct ID.
    const keyData = await this.keyStore.load(this.macAddress);
    
    if (!keyData || !keyData.code) {
      console.log(`No auth code found for ${this.macAddress}, skipping authentication.`);
      return; 
    }

    const authCode = keyData.code;
    await this.writeCharacteristic(UUID_AUTH, Buffer.from(authCode, 'hex'));
    console.log(`Authenticated with ${this.macAddress}`);
  }

  async getCharacteristic(uuid) {
    await this.connect();
    const peripheral = await this.getPeripheral();
    const services = await peripheral.discoverServices();
    
    for (const service of services) {
      const chars = await service.discoverCharacteristics();
      const char = chars.find(c => c.uuid === uuid);
      if (char) return char;
    }
    throw new Error(`Characteristic ${uuid} not found`);
  }

  async readCharacteristic(uuid) {
    try {
      const char = await this.getCharacteristic(uuid);
      return await char.read();
    } catch (err) {
      console.error(`Error reading ${uuid}:`, err);
      this.disconnect(); // Force disconnect to reset state on error
      throw err;
    }
  }

  async writeCharacteristic(uuid, data) {
    try {
      const char = await this.getCharacteristic(uuid);
      await char.write(data);
    } catch (err) {
      console.error(`Error writing ${uuid}:`, err);
      this.disconnect();
      throw err;
    }
  }
}

module.exports = ConnectionManager;
