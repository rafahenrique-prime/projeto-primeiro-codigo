import { useState, useEffect } from 'react'
import { getProfileLearningEvents } from '../services/auditoria/profileLearningAuditService'

export default function ProfileLearningAuditTab({ t }) {
  const [loading, setLoading] = useState(true)
  const [events, setEvents] = useState([])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getProfileLearningEvents().then(rows => {
      if (!cancelled) { setEvents(rows); setLoading(false) }
    })
    return () => { cancelled = true }
  }, [])

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: '0 auto' }}>
      <h2 style={{ fontSize: 17, fontWeight: 700, color: t.text, margin: '0 0 4px' }}>🧵 Aprendizado de Perfil</h2>
      <p style={{ fontSize: 12, color: t.textMuted, marginTop: 0, marginBottom: 20 }}>
        Histórico de quando o sistema detectou automaticamente o tamanho (size) de um cliente a partir de uma mensagem — só leitura, gravado pelo backend a cada mensagem nova.
      </p>

      {loading ? (
        <div style={{ textAlign: 'center', color: t.textMuted, fontSize: 13, padding: '40px 0' }}>Carregando...</div>
      ) : events.length === 0 ? (
        <div style={{ textAlign: 'center', color: t.textMuted, fontSize: 13, padding: '40px 0' }}>
          Nenhum aprendizado registrado ainda.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {events.map(ev => (
            <EventCard key={ev.id} ev={ev} t={t} />
          ))}
        </div>
      )}
    </div>
  )
}

function EventCard({ ev, t }) {
  return (
    <div style={{ background: t.bg, border: `1px solid ${t.border}`, borderRadius: 10, padding: '12px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, flexWrap: 'wrap', gap: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: t.text }}>
          {ev.old_value ? `${ev.old_value} → ${ev.new_value}` : `Definido: ${ev.new_value}`}
        </span>
        <span style={{ fontSize: 11, color: t.textMuted }}>
          {ev.created_at ? new Date(ev.created_at).toLocaleString('pt-BR') : ''}
        </span>
      </div>
      {ev.source_text && (
        <div style={{ fontSize: 12, color: t.textMid, marginBottom: 4, fontStyle: 'italic' }}>"{ev.source_text}"</div>
      )}
      <div style={{ fontSize: 11, color: t.textMuted, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <span>Regra: {ev.rule_matched}</span>
        {ev.channel && <span>Canal: {ev.channel}</span>}
        <span>{ev.applied ? '✅ Aplicado' : '↩️ Revertido'}</span>
      </div>
    </div>
  )
}
