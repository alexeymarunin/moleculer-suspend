/**
 * Module mixin.test.js
 * Mixin unit tests
 *
 * @author  Alexey Marunin <108dev.marunin@gmail.com>
 * @since   1.0
 */

const { ServiceBroker, Errors } = require('moleculer')
const { expect } = require('chai')
const SuspendServiceMixin = require('..')

describe('Suspend service mixin', function () {
  let broker

  beforeEach(async function () {
    broker = new ServiceBroker({
      namespace: 'test',
      transporter: 'TCP',
    })
    await broker.start()
  })
  afterEach(async function () {
    await broker.stop()
  })

  it('should success suspend/resume service`', function (done) {
    const scenario = async () => {
      const result = { suspended: false, resumed: false }
      broker.createService({
        name: 'foo',
        mixins: [SuspendServiceMixin],
        events: {
          'service.foo.suspended' () {
            result.suspended = true
          },
          'service.foo.resumed' () {
            result.resumed = true
          },
        }
      })
      await broker.waitForServices('foo')
      await broker.call('foo.suspendService')
      await broker.call('foo.resumeService')
      return result
    }
    const validate = (result) => {
      expect(result).to.have.property('suspended', true)
      expect(result).to.have.property('resumed', true)
      done()
    }
    scenario()
      .then(validate)
      .catch(done)
  })

  it('should raise error to call action of suspended service`', function (done) {
    const scenario = async () => {
      broker.createService({
        name: 'foo',
        mixins: [SuspendServiceMixin],
        actions: {
          baz: {
            handler: async ctx => ctx
          }
        }
      })
      await broker.waitForServices('foo')
      await broker.call('foo.suspendService')
      return await broker.call('foo.baz', {}, {
        fallbackResponse: (ctx, error) => error
      })
    }
    const validate = (result) => {
      expect(result).to.be.an.instanceof(Errors.MoleculerError)
      done()
    }
    scenario()
      .then(validate)
      .catch(done)
  })
})
