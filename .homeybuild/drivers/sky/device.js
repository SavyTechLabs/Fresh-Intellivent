const Homey = require('homey');
const FreshIntelliventSky = require('../../lib/sky');

class SkyDevice extends Homey.Device {
  async onInit() {
    this.log('SkyDevice has been initialized');
    try {
        this.sky = null;
        this.pollTimer = null;

        // Register listeners
        this.registerCapabilityListener('boost_mode', this.onCapabilityBoost.bind(this));
        this.registerCapabilityListener('pause_mode', this.onCapabilityPause.bind(this));
        this.registerCapabilityListener('constant_speed_mode', this.onCapabilityConstantSpeed.bind(this));
        this.registerCapabilityListener('humidity_mode', this.onCapabilityHumidity.bind(this));
        this.registerCapabilityListener('light_mode', this.onCapabilityLight.bind(this));
        this.registerCapabilityListener('airing_mode', this.onCapabilityAiring.bind(this));
        this.registerCapabilityListener('target_rpm', this.onCapabilityTargetRpm.bind(this));

        // Delay connection to ensure device is fully initialized and added
        // We use a slightly longer delay to be safe
        setTimeout(() => {
            this.connect().catch(err => this.error('Connect failed in onInit:', err));
        }, 2000);
        
        this.log('onInit completed successfully');
    } catch (err) {
        this.error('Error in onInit:', err);
    }
  }

  async onDeleted() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.sky && this.sky.peripheral) {
      await this.sky.peripheral.disconnect().catch(() => {});
    }
  }

  async connect() {
    if (this.sky) return;
    
    try {
      const uuid = this.getData().uuid;
      this.log('Connecting to device with UUID:', uuid);
      const peripheral = await this.homey.ble.find(uuid);
      if (!peripheral) throw new Error('Device not found');

      this.log('Device found, connecting...');
      await peripheral.connect();
      this.log('Connected to device');
      this.sky = new FreshIntelliventSky(peripheral);

      let authCode = this.getSetting('auth_code');
      if (!authCode) {
        try {
          this.log('Fetching auth code...');
          // Add timeout for fetching auth code
          const fetchPromise = this.sky.fetchAuthCode();
          const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout fetching auth code')), 5000));
          authCode = await Promise.race([fetchPromise, timeoutPromise]);
          
          if (authCode && authCode !== '00000000') {
             this.setSettings({ auth_code: authCode });
             this.log('Auth code fetched and saved:', authCode);
          } else {
             this.log('Auth code is empty or zero');
          }
        } catch (err) {
          this.log('Could not fetch auth code (not in pairing mode?)', err);
        }
      }

      if (authCode) {
        this.log('Authenticating with code:', authCode);
        try {
            await this.sky.authenticate(authCode);
            this.log('Authenticated');
        } catch (err) {
            this.error('Authentication failed:', err);
            // Continue anyway to try reading sensors
        }
      } else {
        this.log('No auth code available, skipping authentication');
      }

      this.setAvailable();
      this.poll();
      this.pollTimer = setInterval(() => this.poll(), 60000);
    } catch (err) {
      this.error('Connection error:', err);
      this.setUnavailable(err.message);
      this.sky = null;
      setTimeout(() => this.connect(), 30000);
    }
  }

  async poll() {
    if (!this.sky) return;
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

    } catch (err) {
      this.error('Polling error:', err);
      this.sky = null;
      clearInterval(this.pollTimer);
      this.setUnavailable(err.message);
      this.connect();
    }
  }

  async onSettings({ oldSettings, newSettings, changedKeys }) {
    if (!this.sky) throw new Error('Not connected');

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
         await this.sky.authenticate(newSettings.auth_code);
       }
    }
  }

  async onCapabilityTargetRpm(value) {
    if (!this.sky) throw new Error('Not connected');
    const current = await this.sky.getConstantSpeed();
    await this.sky.setConstantSpeed(current.enabled, value);
  }

  async onCapabilityBoost(value) {
    if (!this.sky) throw new Error('Not connected');
    const current = await this.sky.getBoost();
    await this.sky.setBoost(value, current.minutes, current.rpm);
  }

  async onCapabilityPause(value) {
    if (!this.sky) throw new Error('Not connected');
    const current = await this.sky.getPause();
    await this.sky.setPause(value, current.minutes);
  }

  async onCapabilityConstantSpeed(value) {
    if (!this.sky) throw new Error('Not connected');
    const current = await this.sky.getConstantSpeed();
    await this.sky.setConstantSpeed(value, current.rpm);
  }

  async onCapabilityHumidity(value) {
    if (!this.sky) throw new Error('Not connected');
    const current = await this.sky.getHumidity();
    await this.sky.setHumidity(value, current.detection, current.rpm);
  }

  async onCapabilityLight(value) {
    if (!this.sky) throw new Error('Not connected');
    const current = await this.sky.getLightVOC();
    await this.sky.setLightVOC(value, current.light.detection, current.voc.enabled, current.voc.detection);
  }

  async onCapabilityAiring(value) {
    if (!this.sky) throw new Error('Not connected');
    const current = await this.sky.getAiring();
    await this.sky.setAiring(value, current.runTime, current.rpm);
  }
}

module.exports = SkyDevice;
