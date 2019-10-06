'use strict'
const mqtt = require('mqtt')
const debounce = require('lodash/debounce')

class HomebridgeMQTTBase {
  state = {}

  callbackQueue = []

  constructor(log, { port = 1883, host = 'localhost', client, outboundTopic, inboundTopic }) {
    const address = `mqtt://${host}:${port}`
    this.client = client || mqtt.connect(address)
    this.outboundTopic = outboundTopic
    this.inboundTopic = inboundTopic
    this._log = log

    log(`Attempting to connect to MQTT broker at ${address}...`)

    this.client.on('connect', this.onConnect)
    this.client.on('error', this.onError)
    this.client.on('message', this.onMessage)
    this.client.subscribe(outboundTopic, this.onSubscribeComplete)
  }

  // using an arrow functions for these handler methods so we don't have to bind where we pass this to the MQTT client
  onConnect = () => {
    this._log('Connection to MQTT broker successfully established!')
  }

  onError = error => {
    this._log('Error establishing connection to MQTT broker!')
    this._log(error)
  }

  onMessage = (topic, buffer) => {
    if (topic !== this.outboundTopic) {
      return
    }
    const payload = buffer.toString('utf8')
    this._log(`Received ${payload} from ${this.outboundTopic}`)
    const state = JSON.parse(payload)
    this.onRemoteStateChange(state)
  }

  onSubscribeComplete = err => {
    if (err) {
      this._log(`An error occurred subscribing to ${this.outboundTopic}`)
      this._log(err)
      return
    }
    this._log(`Successfully subscribed to ${this.outboundTopic}`)
  }

  // This makes it easy for consumers to customize log behavior without busting any internal logging
  log(...args) {
    this._log.apply(this, args)
  }

  // This should be implemented by a consumer
  onRemoteStateChange() { }

  setStateAndEmit(state, callback) {
    this._log(`Setting state ${JSON.stringify(state)}`)
    this.callbackQueue.push(callback)
    Object.assign(this.state, state)
    this.sendStateToClients()
  }

  // We debounce because some characteristics may be set simultaneously and it's best to group them together
  sendStateToClients = debounce(() => {
    this.sendMessage(this.state, error => {
      let callback
      while (callback = this.callbackQueue.shift()) {
        // Not needed, but I'd prefer not to pass an undefined argument when there is no error
        if (error) {
          callback(error)
        } else {
          callback()
        }
      }
    })
  }, 20)

  sendMessage(payload, callback) {
    const message = JSON.stringify(payload)
    this._log(`Publishing ${message} to ${this.inboundTopic}`)
    this.client.publish(this.inboundTopic, message, { qos: 2 }, callback)
  }

  identify(callback) {
    this._log('Identify requested!')
    callback()
  }
}

module.exports = {
  HomebridgeMQTTBase
}
