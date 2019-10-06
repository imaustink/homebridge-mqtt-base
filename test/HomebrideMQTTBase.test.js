import test from 'ava'
import sinon from 'sinon'
import { HomebridgeMQTTBase } from '../src/HomebridgeMQTTBase.js'
import mqtt from 'mqtt'
import noop from 'lodash/noop'

const TEST_OUTBOUND_TOPIC = 'foo/bar'
const TEST_INBOUND_TOPIC = 'bar/foo'

// Clear out any existing calls to _log (like stuff call in the constructor) to make the tests less brittle
// This may seem like a strange way of handling this, but I am not a fan of using calledWith() because it doesn't catch erroneous calls
const clearLogHistory = base => {
  base._log.resetHistory()
}

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

const createMockMQTT = () => ({
  on: sinon.spy(),
  subscribe: sinon.spy(),
  publish: sinon.spy((topic, payload, options, callback) => callback())
})

class TestBase extends HomebridgeMQTTBase {
  constructor() {
    const client = createMockMQTT()
    super(sinon.spy(), {
      client,
      outboundTopic: TEST_OUTBOUND_TOPIC,
      inboundTopic: TEST_INBOUND_TOPIC
    })
  }
  onRemoteStateChange = sinon.spy()
}

test.before(t => {
  t.context = mqtt.connect
  mqtt.connect = sinon.spy(() => createMockMQTT())
})

test.beforeEach(t => {
  mqtt.connect.resetHistory()
})

test.after(t => {
  mqtt.connect = t.context
})

test('constructor()', t => {
  const base = new TestBase()
  const { on, subscribe } = base.client

  t.deepEqual(on.firstCall.args, ['connect', base.onConnect])
  t.deepEqual(on.secondCall.args, ['error', base.onError])
  t.deepEqual(on.thirdCall.args, ['message', base.onMessage])
  t.deepEqual(subscribe.firstCall.args, [TEST_OUTBOUND_TOPIC, base.onSubscribeComplete])
  t.is(base._log.firstCall.args[0], 'Attempting to connect to MQTT broker at mqtt://localhost:1883...')
})

// These two need to run in series to avoid assertions mqtt.connect from colliding
test.serial('constructor() does init mqtt with defaults', t => {
  new HomebridgeMQTTBase(noop, {})
  t.true(mqtt.connect.calledOnce)
  t.deepEqual(mqtt.connect.firstCall.args, [`mqtt://localhost:1883`])
})

test.serial('constructor() does init mqtt with overrides', t => {
  const outboundTopic = 'foo/outbound'
  const inboundTopic = 'foo/inbound'
  const base = new HomebridgeMQTTBase(noop, {
    port: 1337,
    host: 'www.austinkurpuis.com',
    outboundTopic,
    inboundTopic
  })
  t.is(mqtt.connect.callCount, 1)
  t.deepEqual(mqtt.connect.firstCall.args, [`mqtt://www.austinkurpuis.com:1337`])
  t.is(base.outboundTopic, outboundTopic)
  t.is(base.inboundTopic, inboundTopic)
})

test('onConnect()', t => {
  const base = new TestBase()


  clearLogHistory(base)
  base.onConnect()

  t.deepEqual(base._log.firstCall.args, ['Connection to MQTT broker successfully established!'])
})

test('onError()', t => {
  const base = new TestBase()
  const error = new Error('Failed to connect!')

  clearLogHistory(base)
  base.onError(error)

  t.deepEqual(base._log.firstCall.args, ['Error establishing connection to MQTT broker!'])
  t.deepEqual(base._log.secondCall.args, [error])
})

test('onMessage() correct topic', t => {
  const base = new TestBase()
  const payload = { foo: 'bar' }
  const rawPayload = JSON.stringify(payload)
  const buf = Buffer.from(rawPayload)

  clearLogHistory(base)
  base.onMessage(TEST_OUTBOUND_TOPIC, buf)

  t.deepEqual(base._log.firstCall.args, [`Received ${rawPayload} from ${TEST_OUTBOUND_TOPIC}`])
  t.deepEqual(base.onRemoteStateChange.firstCall.args, [payload])
})

test('onMessage() incorrect topic', t => {
  const base = new TestBase()

  base.onMessage('foo')

  t.true(base.onRemoteStateChange.notCalled)
})

test('onSubscribeComplete() error', t => {
  const base = new TestBase()
  const error = new Error('Failed to connect!')

  clearLogHistory(base)
  base.onSubscribeComplete(error)

  t.true(base._log.calledTwice)
  t.deepEqual(base._log.firstCall.args, [`An error occurred subscribing to ${TEST_OUTBOUND_TOPIC}`])
  t.deepEqual(base._log.secondCall.args, [error])
})

test('onSubscribeComplete() success', t => {
  const base = new TestBase()

  clearLogHistory(base)
  base.onSubscribeComplete(null)

  t.deepEqual(base._log.firstCall.args, [`Successfully subscribed to ${TEST_OUTBOUND_TOPIC}`])
  t.true(base._log.calledOnce)
})

test('log', t => {
  const base = new TestBase()

  clearLogHistory(base)
  base.log('foo', 'bar')

  t.deepEqual(base._log.firstCall.args, ['foo', 'bar'])
})

test('setStateAndEmit()', t => {
  const base = new TestBase()
  const state = { foo: 'bar' }
  const callback = noop;
  base.sendStateToClients = sinon.spy()

  clearLogHistory(base)
  base.setStateAndEmit(state, callback)

  t.deepEqual(base._log.firstCall.args, [`Setting state ${JSON.stringify(state)}`])
  t.deepEqual(base.callbackQueue, [callback])
  t.deepEqual(base.state, state)
  t.true(base.sendStateToClients.calledOnce)
})

test('sendStateToClients() success', async t => {
  const base = new TestBase()
  const firstCallback = sinon.spy()
  const secondCallback = sinon.spy()
  base.sendMessage = sinon.spy((payload, callback) => { callback() })

  base.state.foo = true;
  base.callbackQueue.push(firstCallback, secondCallback)

  base.sendStateToClients()
  base.sendStateToClients()

  await delay(40)

  t.true(firstCallback.calledOnce)
  t.true(secondCallback.calledOnce)
  t.deepEqual(firstCallback.firstCall.args, [])
  t.deepEqual(secondCallback.firstCall.args, [])
  t.is(base.sendMessage.firstCall.args[0], base.state)
})

test('sendStateToClients() error', async t => {
  const base = new TestBase()
  const firstCallback = sinon.spy()
  const secondCallback = sinon.spy()
  const error = new Error('Failed to send message!')
  base.sendMessage = sinon.spy((payload, callback) => { callback(error) })

  base.state.foo = true;
  base.callbackQueue.push(firstCallback, secondCallback)

  base.sendStateToClients()
  base.sendStateToClients()

  await delay(40)

  t.true(firstCallback.calledOnce)
  t.true(secondCallback.calledOnce)
  t.deepEqual(firstCallback.firstCall.args, [error])
  t.deepEqual(secondCallback.firstCall.args, [error])
  t.is(base.sendMessage.firstCall.args[0], base.state)
})

test('sendMessage()', t => {
  const base = new TestBase()
  const rawPayload = { foo: true }
  const payload = JSON.stringify(rawPayload);
  const callback = sinon.spy()

  clearLogHistory(base)
  base.sendMessage(rawPayload, callback)

  t.deepEqual(base._log.firstCall.args, [`Publishing ${payload} to ${TEST_INBOUND_TOPIC}`])
  t.deepEqual(base.client.publish.firstCall.args, [TEST_INBOUND_TOPIC, payload, { qos: 2 }, callback])
})

test('identify()', t => {
  const base = new TestBase()
  const callback = sinon.spy()

  clearLogHistory(base)
  base.identify(callback)

  t.deepEqual(base._log.firstCall.args, ['Identify requested!'])
  t.true(callback.calledOnce)
})
