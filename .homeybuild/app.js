const Homey = require('homey');

class FreshIntelliventApp extends Homey.App {
  onInit() {
    this.log('Fresh Intellivent App is running...');
  }
}

module.exports = FreshIntelliventApp;
