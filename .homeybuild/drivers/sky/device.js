const Homey = require('homey');
const FreshIntelliventSky = require('../../lib/sky');
const ConnectionManager = require('../../lib/ConnectionManager');
const KeyStore = require('../../lib/KeyStore');

class SkyDevice extends Homey.Device {
  async onInit() {
    this.log('SkyDevice has been initialized');
    try {
        this.connectionManager = new ConnectionManager(this.homey, this.getData().uuid);
        this.sky = new FreshIntelliventSky(this.connectionManager);
        this.pollTimer = null;

        /*
        // Migration: Move auth_code from settings to KeyStore
        const authCode = this.getSetting('auth_code');
        if (authCode) {
            this.log('Migrating auth code to KeyStore');
            const keyStore = new KeyStore(this.homey);
            await keyStore.save(this.getData().uuid, { code: authCode });
            await this.setSettings({ auth_code: null }); // Clear setting
        }
        */

        // Register listeners
        this.registerCapabilityListener('boost_mode', this.onCapabilityBoost.bind(this));
        this.registerCapabilityListener('pause_mode', this.onCapabilityPause.bind(this));
        this.registerCapabilityListener('constant_speed_mode', this.onCapabilityConstantSpeed.bind(this));
        this.registerCapabilityListener('humidity_mode', this.onCapabilityHumidity.bind(this));
        this.registerCapabilityListener('light_mode', this.onCapabilityLight.bind(this));
        this.registerCapabilityListener('airing_mode', this.onCapabilityAiring.bind(this));
        this.registerCapabilityListener('target_rpm', this.onCapabilityTargetRpm.bind(this));

        this.setAvailable();
        this.poll();
        this.pollTimer = setInterval(() => this.poll(), 60000);
        
        this.log('onInit completed successfully');
    } catch (err) {
        this.error('Error in onInit:', err);
    }
  }

  async onDeleted() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.connectionManager) {
      await this.connectionManager.disconnect();
    }
  }

  async poll() {
    try {
      const sensorData = await this.sky.getSensorData();
      await this.setCapabilityValue('measure_rpm', sensorData.rpm);
      await this.setCapabilityValue('measure_temperature', sensorData.temp);

      const boost = await this.sky.getBoost();
      await this.setCapabilityValue('boost_mode', boost.enabled);
      
      const pause = await this.sky.getPause();
      await this.setCapabilityValue('pause_mode', pause.enabled);
      
      const constant = await this.sky.getConstantSpeed();
      await this.setCapabilityValue('constant_speed_mode', constant.enabled);
      await this.setCapabilityValue('target_rpm', constant.rpm);
      
      const humidity = await this.sky.getHumidity();
      await this.setCapabilityValue('humidity_mode', humidity.enabled);
      
      const light = await this.sky.getLightVOC();
      await this.setCapabilityValue('light_mode', light.light.enabled);
      
      const airing = await this.sky.getAiring();
      await this.setCapabilityValue('airing_mode', airing.enabled);
      
      if (!this.getAvailable()) {
          this.setAvailable();
      }

    } catch (err) {
      this.error('Polling error:', err);
      this.setUnavailable(err.message);
      // Do not clear timer, ConnectionManager handles backoff/retry on next call
    }
  }

  async onSettings({ oldSettings, newSettings, changedKeys }) {
    if (changedKeys.includes('humidity_rpm') || changedKeys.includes('humidity_detection')) {
      const current = await this.sky.getHumidity();
      await this.sky.setHumidity(
        current.enabled,
        parseInt(newSettings.humidity_detection),
        newSettings.humidity_rpm
      );
    }

    if (changedKeys.includes('boost_rpm') || changedKeys.includes('boost_minutes')) {
      const current = await this.sky.getBoost();
      await this.sky.setBoost(
        current.enabled,
        newSettings.boost_minutes,
        newSettings.boost_rpm
      );
    }

    if (changedKeys.includes('pause_minutes')) {
      const current = await this.sky.getPause();
      await this.sky.setPause(
        current.enabled,
        newSettings.pause_minutes
      );
    }

    if (changedKeys.includes('auth_code')) {
       if (newSettings.auth_code) {
         const keyStore = new KeyStore(this.homey);
         await keyStore.save(this.getData().uuid, { code: newSettings.auth_code });
         // Trigger re-auth? ConnectionManager will use it next time.
         // We can force disconnect to ensure re-auth happens.
         await this.connectionManager.disconnect();
       }
    }
  }

  async onCapabilityTargetRpm(value) {
    const current = await this.sky.getConstantSpeed();
    await this.sky.setConstantSpeed(current.enabled, value);
  }

  async onCapabilityBoost(value) {
    const current = await this.sky.getBoost();
    await this.sky.setBoost(value, current.minutes, current.rpm);
  }

  async onCapabilityPause(value) {
    const current = await this.sky.getPause();
    await this.sky.setPause(value, current.minutes);
  }

  async onCapabilityConstantSpeed(value) {
    const current = await this.sky.getConstantSpeed();
    await this.sky.setConstantSpeed(value, current.rpm);
  }

  async onCapabilityHumidity(value) {
    const current = await this.sky.getHumidity();
    await this.sky.setHumidity(value, current.detection, current.rpm);
  }

  async onCapabilityLight(value) {
    const current = await this.sky.getLightVOC();
    await this.sky.setLightVOC(value, current.light.detection, current.voc.enabled, current.voc.detection);
  }

  async onCapabilityAiring(value) {
    const current = await this.sky.getAiring();
    await this.sky.setAiring(value, current.runTime, current.rpm);
  }
}

module.exports = SkyDevice;
