import test from 'node:test'
import assert from 'node:assert/strict'
import { inspectLiteWebhookShape } from '../api/_primeAlertV24LiteSignalShape.js'

const raw = {
  role:'system',channel:'WHATSAPP',conversationNotificationType:'TRANSFER_QUEUE',
  contextId:'SECRET_CHAT_IDENTIFIER',messageId:'SECRET_MESSAGE_IDENTIFIER',
  agentId:'SECRET_AGENT_ID', phone:'199999999999',message:'Private customer message',
  token:'API_SECRET_PLAINTEXT',recipient:'person@example.com', media:'private media',
  'this-secret-should-never-show-in-keys':'private value',
}
test('sanitized output retains only allowed metadata and flags', () => {
  const result=inspectLiteWebhookShape(raw)
  assert.equal(result.notification_type,'TRANSFER_QUEUE')
  assert.equal(result.notification_field,'conversationNotificationType')
  assert.equal(result.role,'system')
  assert.equal(result.has_context_id,true)
  assert.equal(result.has_message_id,true)
  const text=JSON.stringify(result)
  for(const secret of [raw.contextId,raw.messageId,raw.agentId,raw.phone,raw.message,
    raw.token,raw.recipient,raw.media,'this-secret-should-never-show-in-keys'])
    assert.equal(text.includes(secret),false)
})
test('normal system messages are not reclassified as transfers', () => {
  const result=inspectLiteWebhookShape({role:'system',channel:'WHATSAPP',contextId:'fake'})
  assert.equal(result.notification_type,'MISSING')
})
test('unknown/oversized event types never leak into logs', () => {
  for(const notificationType of ['customer@example.com','A'.repeat(200)]) {
    const result=inspectLiteWebhookShape({eventType:notificationType})
    assert.equal(result.notification_type,'OTHER')
    assert.equal(JSON.stringify(result).includes(notificationType),false)
  }
})
test('alternative event field can be observed without transmitting values', () => {
  const result=inspectLiteWebhookShape({notificationType:'TRANSFER_AGENT'})
  assert.equal(result.notification_type,'TRANSFER_AGENT')
  assert.equal(result.notification_field,'notificationType')
})
test('invalid bodies and surprise role/channel become safe enums',()=>{
  for(const body of [null,[],15,'abc',{'role':'someone@example.com','channel':'CUSTOMER'}]) {
    const out=inspectLiteWebhookShape(body)
    assert.equal(out.has_context_id,false)
    assert.equal(out.role,'OTHER')
    assert.equal(out.channel,'OTHER')
  }
})
