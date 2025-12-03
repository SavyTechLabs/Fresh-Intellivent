const util = require('./util');

const UUIDs = {
  DEVICE_NAME: 'b85fa07a-9382-4838-871c-81d045dcc2ff',
  DEVICE_STATUS: '528b80e8-c47a-4c0a-bdf1-916a7748f412',
  AUTH: '4cad343a-209a-40b7-b911-4d9b3df569b2',
  HUMIDITY: '7c4adc01-2f33-11e7-93ae-92361f002671',
  LIGHT_VOC: '7c4adc02-2f33-11e7-93ae-92361f002671',
  CONSTANT_SPEED: '7c4adc03-2f33-11e7-93ae-92361f002671',
  TIMER: '7c4adc04-2f33-11e7-93ae-92361f002671',
  AIRING: '7c4adc05-2f33-11e7-93ae-92361f002671',
  PAUSE: '7c4adc06-2f33-11e7-93ae-92361f002671',
  BOOST: '7c4adc07-2f33-11e7-93ae-92361f002671',
  TEMPORARY_SPEED: '7c4adc08-2f33-11e7-93ae-92361f002671',
};

class FreshIntelliventSky {
  constructor(peripheral) {
    this.peripheral = peripheral;
  }

  async fetchAuthCode() {
    const char = await this._getCharacteristic(UUIDs.AUTH);
    const data = await char.read();
    return data.toString('hex');
  }

  async authenticate(authCode) {
    if (!authCode) throw new Error('Auth code required');
    
    // The python code writes the auth code to the AUTH characteristic.
    // It does NOT use BLE bonding/pairing in the OS sense.
    // It uses application-level authentication by writing a code to a characteristic.
    
    const buffer = Buffer.from(authCode, 'hex');
    const char = await this._getCharacteristic(UUIDs.AUTH);
    await char.write(buffer);
  }

  async _getCharacteristic(uuid) {
    // console.log(`Discovering services to find characteristic ${uuid}...`);
    const services = await this.peripheral.discoverServices();
    for (const service of services) {
      // console.log(`Service found: ${service.uuid}`);
      const chars = await service.discoverCharacteristics();
      const char = chars.find(c => c.uuid === uuid);
      if (char) {
          // console.log(`Characteristic ${uuid} found in service ${service.uuid}`);
          return char;
      }
    }
    throw new Error(`Characteristic ${uuid} not found`);
  }

  async getHumidity() {
    const char = await this._getCharacteristic(UUIDs.HUMIDITY);
    const data = await char.read();
    // <BBH: enabled (1), detection (1), rpm (2)
    const enabled = data.readUInt8(0) !== 0;
    const detection = data.readUInt8(1);
    const rpm = data.readUInt16LE(2);
    return { enabled, detection, rpm };
  }

  async setHumidity(enabled, detection, rpm) {
    const char = await this._getCharacteristic(UUIDs.HUMIDITY);
    const buffer = Buffer.alloc(4);
    buffer.writeUInt8(enabled ? 1 : 0, 0);
    buffer.writeUInt8(util.validatedDetection(detection), 1);
    buffer.writeUInt16LE(util.validatedRPM(rpm), 2);
    await char.write(buffer);
  }

  async getLightVOC() {
    const char = await this._getCharacteristic(UUIDs.LIGHT_VOC);
    const data = await char.read();
    // <4B: lightEnabled, lightDetection, vocEnabled, vocDetection
    return {
      light: {
        enabled: data.readUInt8(0) !== 0,
        detection: data.readUInt8(1)
      },
      voc: {
        enabled: data.readUInt8(2) !== 0,
        detection: data.readUInt8(3)
      }
    };
  }

  async setLightVOC(lightEnabled, lightDetection, vocEnabled, vocDetection) {
    const char = await this._getCharacteristic(UUIDs.LIGHT_VOC);
    const buffer = Buffer.alloc(4);
    buffer.writeUInt8(lightEnabled ? 1 : 0, 0);
    buffer.writeUInt8(util.validatedDetection(lightDetection), 1);
    buffer.writeUInt8(vocEnabled ? 1 : 0, 2);
    buffer.writeUInt8(util.validatedDetection(vocDetection), 3);
    await char.write(buffer);
  }

  async getConstantSpeed() {
    const char = await this._getCharacteristic(UUIDs.CONSTANT_SPEED);
    const data = await char.read();
    // <BH: enabled, rpm
    return {
      enabled: data.readUInt8(0) !== 0,
      rpm: data.readUInt16LE(1)
    };
  }

  async setConstantSpeed(enabled, rpm) {
    const char = await this._getCharacteristic(UUIDs.CONSTANT_SPEED);
    const buffer = Buffer.alloc(3);
    buffer.writeUInt8(enabled ? 1 : 0, 0);
    buffer.writeUInt16LE(util.validatedRPM(rpm), 1);
    await char.write(buffer);
  }

  async getTimer() {
    const char = await this._getCharacteristic(UUIDs.TIMER);
    const data = await char.read();
    // <3BH: runTime, delayEnabled, delayMinutes, rpm
    return {
      runTime: data.readUInt8(0),
      delay: {
        enabled: data.readUInt8(1) !== 0,
        minutes: data.readUInt8(2)
      },
      rpm: data.readUInt16LE(3)
    };
  }

  async setTimer(runTime, delayEnabled, delayMinutes, rpm) {
    const char = await this._getCharacteristic(UUIDs.TIMER);
    const buffer = Buffer.alloc(5);
    buffer.writeUInt8(runTime, 0);
    buffer.writeUInt8(delayEnabled ? 1 : 0, 1);
    buffer.writeUInt8(delayMinutes, 2);
    buffer.writeUInt16LE(util.validatedRPM(rpm), 3);
    await char.write(buffer);
  }

  async getAiring() {
    const char = await this._getCharacteristic(UUIDs.AIRING);
    const data = await char.read();
    // <3BH: enabled, ?, minutes, rpm
    return {
      enabled: data.readUInt8(0) !== 0,
      runTime: data.readUInt8(2),
      rpm: data.readUInt16LE(3)
    };
  }

  async setAiring(enabled, runTime, rpm) {
    const char = await this._getCharacteristic(UUIDs.AIRING);
    const buffer = Buffer.alloc(5);
    buffer.writeUInt8(enabled ? 1 : 0, 0);
    buffer.writeUInt8(26, 1); // Always 26 (0x1A)
    buffer.writeUInt8(util.validatedMinutes(runTime), 2);
    buffer.writeUInt16LE(util.validatedRPM(rpm), 3);
    await char.write(buffer);
  }

  async getPause() {
    const char = await this._getCharacteristic(UUIDs.PAUSE);
    const data = await char.read();
    // <2B: enabled, minutes
    return {
      enabled: data.readUInt8(0) !== 0,
      minutes: data.readUInt8(1)
    };
  }

  async setPause(enabled, minutes) {
    const char = await this._getCharacteristic(UUIDs.PAUSE);
    const buffer = Buffer.alloc(2);
    buffer.writeUInt8(enabled ? 1 : 0, 0);
    buffer.writeUInt8(util.validatedMinutes(minutes), 1);
    await char.write(buffer);
  }

  async getBoost() {
    const char = await this._getCharacteristic(UUIDs.BOOST);
    const data = await char.read();
    // <B2H: enabled, minutes, rpm. Wait, python says <B2H?
    // Python: unpack("<B2H", ...) -> enabled, minutes, rpm.
    // B = 1 byte, H = 2 bytes. Total 1+2+2 = 5 bytes.
    // But python code: `boostMinutes = value[1]`, `boostRPM = value[2]`.
    // If minutes is H (short), it's 2 bytes.
    // Let's check python `setBoost`: `pack("<2B", ...)`? No, `pack("<2B", ...)` is wrong if get is `<B2H`.
    // Python `setBoost`: `pack("<2B", ...)` -> Wait, I need to check the python code again.
    // `getBoost`: `unpack("<B2H", ...)`
    // `setBoost`: `pack("<2B", ...)` -> This looks inconsistent in my memory/snippet.
    // Let's re-read the snippet.
    
    // Snippet:
    // def getBoost(self):
    //     value = unpack("<B2H", self._readCharacterisitc(uuid=characteristics.BOOST))
    //     boostEnabled = bool(value[0])
    //     boostMinutes = value[1]
    //     boostRPM = value[2]
    
    // def setBoost(self, boostEnabled, boostMinutes, boostRPM):
    //     value = pack(
    //         "<2B",  <-- Wait, the snippet was cut off or I misread.
    //         bool(boostEnabled),
    //         h.validatedMinutes(boostMinutes),
    //         h.validatedRPM(boostRPM),
    //     )
    
    // `characteristics.md` says:
    // Boost: Format BHH (Byte, Short, Short) -> 1+2+2 = 5 bytes.
    // So `getBoost` using `<B2H` is correct (1 byte, 2 shorts).
    // `setBoost` should probably use `<B2H` too.
    // The snippet for `setBoost` showed `pack("<2B"`. This might be a bug in my reading or the snippet.
    // But `characteristics.md` says `BHH`.
    // I will assume `BHH` (Byte, UInt16, UInt16).
    
    const enabled = data.readUInt8(0) !== 0;
    const minutes = data.readUInt16LE(1);
    const rpm = data.readUInt16LE(3);
    return { enabled, minutes, rpm };
  }

  async setBoost(enabled, minutes, rpm) {
    const char = await this._getCharacteristic(UUIDs.BOOST);
    const buffer = Buffer.alloc(5);
    buffer.writeUInt8(enabled ? 1 : 0, 0);
    buffer.writeUInt16LE(util.validatedMinutes(minutes), 1);
    buffer.writeUInt16LE(util.validatedRPM(rpm), 3);
    await char.write(buffer);
  }

  async setTemporarySpeed(enabled, rpm) {
    const char = await this._getCharacteristic(UUIDs.TEMPORARY_SPEED);
    const buffer = Buffer.alloc(3);
    buffer.writeUInt8(enabled ? 1 : 0, 0);
    buffer.writeUInt16LE(util.validatedRPM(rpm), 1);
    await char.write(buffer);
  }

  async getSensorData() {
    const char = await this._getCharacteristic(UUIDs.DEVICE_STATUS);
    const data = await char.read();
    // <2B5HBH
    // 2B: status, mode
    // 5H: ?, ?, ?, ?, rpm (index 5 in unpack result, so 6th item)
    // Wait, unpack returns tuple.
    // unpack("<2B5HBH")
    // 0: B (status)
    // 1: B (mode)
    // 2: H
    // 3: H
    // 4: H
    // 5: H
    // 6: H (rpm? No, python says `rpm = value[5]`. Value[5] is the 4th H?
    // Let's count:
    // 0: B
    // 1: B
    // 2: H
    // 3: H
    // 4: H
    // 5: H  <-- This is value[5]
    // 6: H
    // 7: B  <-- secs? `secs = value[7]`
    // 8: H  <-- temp? `temp = value[8]`
    
    // So:
    // Offset 0: Status (1 byte)
    // Offset 1: Mode (1 byte)
    // Offset 2: H (2 bytes)
    // Offset 4: H (2 bytes)
    // Offset 6: H (2 bytes)
    // Offset 8: H (2 bytes) -> value[5] (RPM)
    // Offset 10: H (2 bytes)
    // Offset 12: B (1 byte) -> value[7] (Secs?)
    // Offset 13: H (2 bytes) -> value[8] (Temp?)
    
    // Let's verify offsets.
    // 0: B
    // 1: B
    // 2: H
    // 4: H
    // 6: H
    // 8: H (RPM)
    // 10: H
    // 12: B (Secs)
    // 13: H (Temp)
    
    const status = data.readUInt8(0) !== 0;
    const mode = data.readUInt8(1);
    const rpm = data.readUInt16LE(8);
    // secs?
    // temp?
    // Python: `temp = value[8]`.
    // Note: Python struct unpack format `<2B5HBH`
    // 2B = 2 bytes.
    // 5H = 10 bytes.
    // B = 1 byte.
    // H = 2 bytes.
    // Total: 2 + 10 + 1 + 2 = 15 bytes.
    
    // value[0]: B (Status)
    // value[1]: B (Mode)
    // value[2]: H
    // value[3]: H
    // value[4]: H
    // value[5]: H (RPM)
    // value[6]: H
    // value[7]: B (Secs)
    // value[8]: H (Temp)
    
    // So RPM is at offset 2 + 2*3 = 8. Correct.
    // Temp is at offset 2 + 2*5 + 1 = 13. Correct.
    
    const temp = data.readUInt16LE(13);
    
    return {
      status,
      mode,
      rpm,
      temp
    };
  }
}

module.exports = FreshIntelliventSky;
