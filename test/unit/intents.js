/* eslint-env mocha */

// eslint-disable-next-line no-unused-vars
import should from 'should'
import sinon from 'sinon'
import {Client} from '../../src'
import mock from '../mock-api'

function mockElement () {
  const windowMock = {
    postMessage: sinon.spy(),
    addEventListener: sinon.stub(),
    removeEventListener: sinon.spy()
  }
  const iframeMock = {
    setAttribute: sinon.spy(),
    parentNode: {
      removeChild: sinon.stub().returns(iframeMock)
    },
    classList: {
      add: sinon.spy()
    }
  }
  const documentMock = {
    defaultView: windowMock,
    createElement: sinon.stub().returns(iframeMock)
  }
  const iframeWindowMock = {
    postMessage: sinon.spy()
  }
  return {
    ownerDocument: documentMock,
    appendChild: sinon.spy(),
    iframeMock: iframeMock,
    documentMock: documentMock,
    windowMock: windowMock,
    iframeWindowMock: iframeWindowMock
  }
}

describe('Intents', function () {
  const cozy = {}

  const expectedIntent = {
    _id: '77bcc42c-0fd8-11e7-ac95-8f605f6e8338',
    _rev: undefined,
    _type: 'io.cozy.intents',
    attributes: {
      action: 'PICK',
      type: 'io.cozy.files',
      permissions: ['GET'],
      client: 'contacts.cozy.example.net',
      services: [
        {
          slug: 'files',
          href: 'https://files.cozy.example.net/pick?intent=77bcc42c-0fd8-11e7-ac95-8f605f6e8338'
        }
      ]
    },
    links: {
      self: '/intents/77bcc42c-0fd8-11e7-ac95-8f605f6e8338',
      permissions: '/permissions/a340d5e0-d647-11e6-b66c-5fc9ce1e17c6'
    }
  }

  const serviceUrl = 'https://files.cozy.example.net'

  beforeEach(() => {
    cozy.client = new Client({
      cozyURL: 'http://my.cozy.io///',
      token: 'apptoken'
    })
  })
  afterEach(() => mock.restore())

  describe('Create', function () {
    beforeEach(mock.mockAPI('CreateIntent'))

    it('should return created intent', async function () {
      return cozy.client.intents.create('PICK', 'io.cozy.whatever.i.am.a.mock')
        .then(intent => {
          // added by cozy-client-js
          expectedIntent.relations = intent.relations
          should.deepEqual(intent, expectedIntent)
        })
    })

    it('should throw error for malformed intents', function () {
      should.throws(
        () => cozy.client.intents.create(),
        /Misformed intent, "action" property must be provided/
      )

      should.throws(
        () => cozy.client.intents.create(null, 'io.cozy.contacts'),
        /Misformed intent, "action" property must be provided/
      )

      should.throws(
        () => cozy.client.intents.create('PICK'),
        /Misformed intent, "type" property must be provided/
      )
    })
  })

  describe('Intent.start', function () {
    beforeEach(mock.mockAPI('CreateIntent'))

    describe('No Service', function () {
      before(mock.mockAPI('CreateIntentWithNoService'))

      it('should reject with error', async function () {
        const element = mockElement()

        return cozy.client.intents
          .create('EDIT', 'io.cozy.files')
          .start(element)
          .should.be.rejectedWith(/Unable to find a service/)
      })
    })

    it('should inject iframe (not async)', function (done) {
      const element = mockElement()
      const {documentMock, iframeMock} = element

      cozy.client.intents
        .create('PICK', 'io.cozy.files')
        .start(element)

      setTimeout(() => {
        should(documentMock.createElement.withArgs('iframe').calledOnce).be.true()
        should(iframeMock.setAttribute.withArgs('src', expectedIntent.attributes.services[0].href).calledOnce).be.true()
        should(iframeMock.classList.add.withArgs('coz-intent').calledOnce).be.true()
        should(element.appendChild.withArgs(iframeMock).calledOnce).be.true()
        done()
      }, 10)
    })

    it('shoud manage handshake', function (done) {
      const element = mockElement()
      const {windowMock, iframeWindowMock} = element

      const handshakeEventMessageMock = {
        origin: serviceUrl,
        data: 'intent:ready',
        source: iframeWindowMock
      }

      cozy.client.intents
        .create('PICK', 'io.cozy.files', {key: 'value'})
        .start(element)

      setTimeout(() => {
        should(windowMock.addEventListener.withArgs('message').calledOnce).be.true()
        should(windowMock.removeEventListener.neverCalledWith('message')).be.true()

        const messageEventListener = windowMock.addEventListener.firstCall.args[1]

        messageEventListener(handshakeEventMessageMock)
        should(iframeWindowMock.postMessage.calledWithMatch({key: 'value'}, serviceUrl)).be.true()
        done()
      }, 10)
    })

    it('should manage handshake fail', async function () {
      const element = mockElement()
      const {windowMock, iframeWindowMock} = element

      const handshakeEventMessageMock = {
        origin: serviceUrl,
        data: 'unexpected handshake data',
        source: iframeWindowMock
      }

      const call = cozy.client.intents
        .create('PICK', 'io.cozy.files', {key: 'value'})
        .start(element)

      setTimeout(() => {
        should(windowMock.addEventListener.withArgs('message').calledOnce).be.true()
        should(windowMock.removeEventListener.neverCalledWith('message')).be.true()

        const messageEventListener = windowMock.addEventListener.firstCall.args[1]
        messageEventListener(handshakeEventMessageMock)

        should(windowMock.removeEventListener.withArgs('message', messageEventListener).calledOnce).be.true()
      }, 10)

      return call.should.be.rejectedWith(/Unexpected handshake message from intent service/)
    })

    it('should handle intent error', async function () {
      const element = mockElement()
      const {windowMock, iframeWindowMock} = element

      const handshakeEventMessageMock = {
        origin: serviceUrl,
        data: 'intent:error',
        source: iframeWindowMock
      }

      const call = cozy.client.intents
        .create('PICK', 'io.cozy.files', {key: 'value'})
        .start(element)

      setTimeout(() => {
        should(windowMock.addEventListener.withArgs('message').calledOnce).be.true()
        should(windowMock.removeEventListener.neverCalledWith('message')).be.true()

        const messageEventListener = windowMock.addEventListener.firstCall.args[1]
        messageEventListener(handshakeEventMessageMock)

        should(windowMock.removeEventListener.withArgs('message', messageEventListener).calledOnce).be.true()
      }, 10)

      return call.should.be.rejectedWith(/Intent error/)
    })

    it('should handle intent success', async function () {
      const element = mockElement()
      const {windowMock, iframeWindowMock} = element

      const handshakeEventMessageMock = {
        origin: serviceUrl,
        data: 'intent:ready',
        source: iframeWindowMock
      }

      const result = {
        id: 'abcde1234'
      }

      const resolveEventMessageMock = {
        origin: serviceUrl,
        data: result,
        source: iframeWindowMock
      }

      const call = cozy.client.intents
        .create('PICK', 'io.cozy.files', {key: 'value'})
        .start(element)

      setTimeout(() => {
        should(windowMock.addEventListener.withArgs('message').calledOnce).be.true()
        should(windowMock.removeEventListener.neverCalledWith('message')).be.true()

        const messageEventListener = windowMock.addEventListener.firstCall.args[1]

        messageEventListener(handshakeEventMessageMock)
        should(iframeWindowMock.postMessage.calledWithMatch({key: 'value'}, serviceUrl)).be.true()

        messageEventListener(resolveEventMessageMock)
        should(windowMock.removeEventListener.withArgs('message', messageEventListener).calledOnce).be.true()
      }, 10)

      return call.should.be.fulfilledWith(result)
    })
  })

  describe('CreateService', function () {
    function mockWindow () {
      return {
        addEventListener: sinon.spy(),
        removeEventListener: sinon.spy(),
        parent: {
          postMessage: sinon.stub()
        }
      }
    }

    beforeEach(mock.mockAPI('GetIntent'))

    it('should manage handshake', async function () {
      const windowMock = mockWindow()

      const clientHandshakeEventMessageMock = {
        origin: expectedIntent.attributes.client,
        data: { foo: 'bar' }
      }

      windowMock.parent.postMessage.callsFake(() => {
        const messageEventListener = windowMock.addEventListener.firstCall.args[1]
        windowMock.addEventListener.withArgs('message', messageEventListener).calledOnce.should.be.true()

        messageEventListener(clientHandshakeEventMessageMock)
        windowMock.removeEventListener.withArgs('message', messageEventListener).calledOnce.should.be.true()
      })

      return cozy.client.intents.createService(expectedIntent._id, windowMock)
        .then(service => {
          should(typeof service.getData === 'function').be.true()
          should(typeof service.getIntent === 'function').be.true()
          should(typeof service.terminate === 'function').be.true()
          service.getData().should.deepEqual({foo: 'bar'})
          return true
        }).should.be.fulfilledWith(true)
    })

    describe('Service', function () {
      describe('Terminate', function () {
        it('should send result document to Client', async function () {
          const windowMock = mockWindow()

          const clientHandshakeEventMessageMock = {
            origin: expectedIntent.attributes.client,
            data: { foo: 'bar' }
          }

          const result = {
            type: 'io.cozy.things'
          }

          windowMock.parent.postMessage.callsFake(() => {
            const messageEventListener = windowMock.addEventListener.firstCall.args[1]
            messageEventListener(clientHandshakeEventMessageMock)
          })

          const service = await cozy.client.intents.createService(expectedIntent._id, windowMock)

          service.terminate(result)

          windowMock.parent.postMessage
            .withArgs(result, expectedIntent.attributes.client).calledOnce.should.be.true()
        })

        it('should not be called twice', async function () {
          const windowMock = mockWindow()

          const clientHandshakeEventMessageMock = {
            origin: expectedIntent.attributes.client,
            data: { foo: 'bar' }
          }

          const result = {
            type: 'io.cozy.things'
          }

          windowMock.parent.postMessage.callsFake(() => {
            const messageEventListener = windowMock.addEventListener.firstCall.args[1]
            messageEventListener(clientHandshakeEventMessageMock)
          })

          const service = await cozy.client.intents.createService(expectedIntent._id, windowMock)

          service.terminate(result)

          should.throws(() => {
            service.terminate(result)
          }, /Intent service has already been terminated/)
        })
      })
    })
  })
})