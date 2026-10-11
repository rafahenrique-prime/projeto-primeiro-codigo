import { test } from 'node:test'
import assert from 'node:assert/strict'
import { summarizeV24LiteWebhookFields } from '../api/_primeAlertV24LiteWebhookFields.js'

const pii = {
  phone: '34567899', chatId: 'hidden-chat', recipient: 'user@example.com',
  message: 'PRIVATE MESSAGE CONTENT', authorization: 'SECRET_TOKEN_HERE'
}
for (const [location, input] of [
  ['root', { conversationNotificationType: 'TRANSFER_QUEUE' }],
  ['data', { data: { notificationType: 'TRANSFER_QUEUE' } }],
  ['message', { message: { conversationNotificationType: 'TRANSFER_QUEUE' } }],
  ['data.message', { data: { message: { conversationNotificationType: 'TRANSFER_QUEUE' } } }]
]) {
  test(`${location}: TRANSFER_QUEUE stays an enum`, () => {
    const x = summarizeV24LiteWebhookFields({ ...pii, ...input })
    assert.equal(x.v24_lite_notification_type, 'TRANSFER_QUEUE')
    assert.equal(x.v24_lite_transfer_queue_present, true)
    for (const secret of Object.values(pii)) assert.equal(JSON.stringify(x).includes(secret), false)
  })
}
test('missing event type cannot be inferred as transfer', () => {
  const x = summarizeV24LiteWebhookFields({ ...pii, role:'system' })
  assert.equal(x.v24_lite_notification_type, 'MISSING')
  assert.equal(x.v24_lite_notification_field, 'NONE')
})
test('unrecognized sensitive values are not echoed', () => {
  const x = summarizeV24LiteWebhookFields({ notificationType: pii.message, ...pii })
  assert.equal(x.v24_lite_notification_type, 'OTHER')
  assert.equal(JSON.stringify(x).includes(pii.message), false)
})
test('falls back to known field over unknown type', () => {
  const x = summarizeV24LiteWebhookFields({ type:'CUSTOMER_ORDER', message:{notificationType:'TRANSFER_AGENT'} })
  assert.equal(x.v24_lite_notification_type, 'TRANSFER_AGENT')
  assert.equal(x.v24_lite_notification_field, 'message.notificationType')
})
test('TRANSFER_QUEUE wins over secondary valid event type', () => {
  const x = summarizeV24LiteWebhookFields({ notificationType:'TRANSFER_AGENT', data:{notificationType:'TRANSFER_QUEUE'} })
  assert.equal(x.v24_lite_notification_type, 'TRANSFER_QUEUE')
})
for (const input of [null, [], 123, 'hi']) {
  test('handles a non-object body without exceptions', () => {
    assert.equal(summarizeV24LiteWebhookFields(input).v24_lite_notification_type,'MISSING')
  })
}
test('fixed keys and deterministic data shape', () => {
  const x = summarizeV24LiteWebhookFields({ 'field_with_pii_as_key':'private', type: 77 })
  assert.deepEqual(Object.keys(x), [
    'v24_lite_probe','v24_lite_notification_present', 'v24_lite_notification_field',
    'v24_lite_notification_type', 'v24_lite_transfer_queue_present'
  ])
})
