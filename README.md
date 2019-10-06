# HomebridgeMQTTBase
[![Build Status](https://travis-ci.org/imaustink/homebridge-mqtt-base.svg?branch=master)](https://travis-ci.org/imaustink/homebridge-mqtt-base)

This library provides a base class for building Homebridge plugins that communicate via MQTT.

## Basic usage
```
'use strict';

const { HomebridgeMQTTBase } = require('homebridge-mqtt-base')

module.exports = function (homebridge) {
  const { Service, Characteristic } = homebridge.hap
  class LightExample extends HomebridgeMQTTBase {
    // Set initial state here
    state = {
      on: false
    }

    // Handle state changes from
    onRemoteStateChange(state) {
      const { on } = state
      const { light } = this

      this.log(`Setting state - remote ${JSON.stringify({ on })}`)
      // Update the characteristic in HomeKit
      light.updateCharacteristic(Characteristic.On, on)
      // Update local state to match the remote state pushed
      this.state.on = on
    }

    // Called by HomeBridge when the plugin is instantiated
    getServices() {
      // Setup some service(s)
      const light = this.light = new Service.Lightbulb()
      // Setup a characteristic
      light.getCharacteristic(Characteristic.On)
        // When someone tries to read the current state of the characteristic, this is called
        .on('get', callback => {
          this.log(`Getting On ${this.state.on}`)
          callback(null, this.state.on)
        })
        // When someone sets the characteristic, this is called
        .on('set', (on, callback) => {
          this.log(`Setting On ${on}`)
          this.setStateAndEmit({ on }, callback)
        })
      // Return array of service(s) here
      return [light]
    }
  }
  homebridge.registerAccessory('light-example', 'LightExample', LightExample)
};
```
