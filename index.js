/**
 * Module index.js
 * Mixin schema definition
 *
 * @author  Alexey Marunin <108dev.marunin@gmail.com>
 * @since   1.0
 */

const { MoleculerError } = require('moleculer').Errors
const wildcard = require('wildcard')
const _ = require('lodash')

class ServiceSuspendError extends MoleculerError {
  constructor (data) {
    super('Service suspended', 503, 'SERVICE_SUSPENDED', data)
  }
}

async function callHandler (service, ctx) {
  let handler = _.get(service.settings, 'handler')
  if (_.isString(handler)) handler = service[handler]
  if (_.isFunction(handler)) {
    handler = _.bind(service, handler)
    await handler(ctx)
  }
}

function _findWildcard(collection, value) {
  const result = wildcard(value, collection)
  return result === true || _.size(result) > 0
}

module.exports = {
  settings: {
    suspendSettings: {
      allowedActions: [],
      allowedEvent: [],
      handler: _.noop,
      dependencies: 'suspend',
    }
  },

  created () {
    this.$suspended = false
  },

  hooks: {
    'before': {
      '*': function (ctx) {
        const action = ctx.action.rawName
        const ownActions = ['suspendService', 'resumeService', 'isSuspended']
        if (_.includes(ownActions, action)) return ctx
        const allowedActions = _.get(this.settings, 'suspendSettings.allowedActions', [])
        if (allowedActions === '*' || _findWildcard(allowedActions, action)) return ctx
        const nodeID = ctx.nodeID
        throw new ServiceSuspendError({ action, nodeID })
      }
    }
  },

  events: {
    'service.*.suspend': function (payload, nodeID, event) {
      this.suspendService()
    },
    'service.*.resume': function (payload, nodeID, event) {
      this.resumeService()
    },
    '*': function (payload, nodeID, event) {
      if (!this.isSuspended()) return
      if (_.startsWith(event, '$')) return  // skip internal events
      const ownEvents = ['service.*.suspended', 'service.*.resumed', 'service.suspended', 'service.resumed']
      const allowedEvents = _.get(this.settings, 'suspendSettings.allowedEvents', [])
      if (allowedEvents === '*' || _findWildcard(ownEvents, event) || _findWildcard(allowedEvents, event)) return
      throw new ServiceSuspendError({ event, nodeID })
    }
  },

  actions: {
    suspendService: {
      async handler (ctx) {
        return await this.suspendService(ctx)
      },
    },
    resumeService: {
      async handler (ctx) {
        return await this.resumeService(ctx)
      },
    },
    isSuspended: {
      async handler (ctx) {
        return await this.isSuspended()
      },
    },
  },

  methods: {

    /**
     * Suspend service
     *
     * @author  Alexey Marunin <108dev.marunin@gmail.com>
     * @since   1.0
     *
     * @param {Moleculer.Context} [ctx]
     *
     * @return {Promise<MoleculerServiceSuspendMixin.SuspendStatus>}
     */
    async suspendService (ctx) {
      if (this.isSuspended()) return { suspended: true }
      this.$suspended = true
      this.logger.warn(`Service '${this.name}' suspended`)
      await callHandler(this, ctx)
      const broker = _.has(ctx, 'broadcast') ? ctx : this.broker
      broker.broadcast(`service.${this.name}.suspended`)
      broker.broadcast('service.suspended', { name: this.name })
      return { suspended: this.isSuspended() }
    },

    /**
     * Resume service
     *
     * @author  Alexey Marunin <108dev.marunin@gmail.com>
     * @since   1.0
     *
     * @param {Moleculer.Context} [ctx]
     *
     * @return {Promise<MoleculerServiceSuspendMixin.SuspendStatus>}
     */
    async resumeService (ctx) {
      if (!this.isSuspended()) return { suspended: false }
      this.$suspended = false
      this.logger.warn(`Service '${this.name}' resumed`)
      await callHandler(this, ctx)
      const broker = _.has(ctx, 'broadcast') ? ctx : this.broker
      broker.broadcast(`service.${this.name}.resumed`)
      broker.broadcast('service.resumed', { name: this.name })
      return { suspended: this.isSuspended() }
    },

    /**
     * Return suspend status
     *
     * @author  Alexey Marunin <108dev.marunin@gmail.com>
     * @since   1.0
     *
     * @return {boolean}
     */
    isSuspended () {
      return this.$suspended
    }
  }
}
