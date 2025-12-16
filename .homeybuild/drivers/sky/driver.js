const Homey = require('homey');
const ConnectionManager = require('../../lib/ConnectionManager');
const FreshIntelliventSky = require('../../lib/sky');
const KeyStore = require('../../lib/KeyStore');

class SkyDriver extends Homey.Driver {
  async onPair(session) {
    this.log('onPair session started');

    session.setHandler('list_devices', async () => {
      this.log('list_devices handler called');
      const devices = await this.homey.ble.discover();
      const found = [];

      for (const uuid in devices) {
        const device = devices[uuid];
        if (device.localName === 'Intellivent SKY' || device.localName === 'Intellivent ICE') {
          const deviceObj = {
            name: device.localName,
            data: {
              id: device.uuid,
              uuid: device.uuid,
              address: device.address
            }
          };
          this.log('Found device:', JSON.stringify(deviceObj));
          found.push(deviceObj);
        }
      }
      this.log(`Found ${found.length} devices`);
      return found;
    });
  }
}

module.exports = SkyDriver;
