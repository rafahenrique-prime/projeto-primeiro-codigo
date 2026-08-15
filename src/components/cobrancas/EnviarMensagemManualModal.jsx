import { useState, useEffect, useRef, useCallback } from 'react'
import { enviarMensagemManual } from '../../services/crm/cobrancasService'

// Modal de envio manual de WhatsApp — chama exclusivamente o proxy Vercel
// (?tool=mensagem-manual), nunca a Backend Function do Base44 diretamente. A prévia
// aqui é só uma SIMULAÇÃO VISUAL do template `mensagem_manual` — quem lê o template de
// verdade, substitui variáveis e decide o envio é sempre o backend (PRIME).

const TEXTO_MIN = 2
const TEXTO_MAX = 2000

function maskPhone(phone) {
  const digits = (phone || '').replace(/\D/g, '')
  if (digits.length < 6) return '***'
  return digits.substring(0, 2) + '*'.repeat(digits.length - 6) + digits.substring(digits.length - 4)
}

function gerarUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  // Fallback improvável (browsers muito antigos) — mantém formato UUID v4 válido.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

// Mapeamento amigável — nunca expõe resposta bruta, stack trace, token ou telefone completo.
function mensagemAmigavel(errorCode) {
  const mapa = {
    template_desconectado: 'Esta automação ainda não está ativada.',
    cliente_nao_encontrado: 'Cliente não encontrado.',
    cliente_telefone_invalido: 'O cliente não possui telefone válido.',
    texto_mensagem_invalido: 'Digite uma mensagem entre 2 e 2000 caracteres.',
    request_id_invalido: 'Não foi possível validar esta tentativa. Feche e abra novamente.',
    origin_not_allowed: 'A solicitação foi bloqueada por segurança.',
    rate_limit_excedido: 'Muitas tentativas em pouco tempo. Aguarde e tente novamente.',
    requisicao_em_andamento: 'Muitas tentativas em pouco tempo. Aguarde e tente novamente.',
    unauthorized: 'Você não tem permissão para realizar este envio.',
    timeout: 'O serviço demorou para responder.',
    erro_rede: 'Não foi possível conectar. Verifique sua internet e tente novamente.',
  }
  return mapa[errorCode] || 'Não foi possível processar a mensagem.'
}

export default function EnviarMensagemManualModal({ cliente, theme: t, onClose }) {
  const [texto, setTexto] = useState('')
  const [estado, setEstado] = useState('inicial') // inicial | enviando | sucesso_enviado | sucesso_duplicado | sucesso_nao_ativado | erro | erro_resultado_desconhecido
  const [mensagemErro, setMensagemErro] = useState('')
  const requestIdRef = useRef(gerarUUID())
  const enviandoRef = useRef(false)

  const telefoneValido = Boolean(cliente?.telefone && cliente.telefone !== '-')
  const textoTrim = texto.trim()
  const textoValido = textoTrim.length >= TEXTO_MIN && textoTrim.length <= TEXTO_MAX

  // Fecha com ESC — só quando não está enviando, pra não perder uma requisição em voo.
  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape' && estado !== 'enviando') onClose?.()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [estado, onClose])

  const primeiroNome = (cliente?.nome || '').split(' ')[0] || 'Cliente'

  const handleEnviar = useCallback(async () => {
    if (enviandoRef.current) return // duplo clique não cria segunda requisição
    if (!telefoneValido || !textoValido) return

    enviandoRef.current = true
    setEstado('enviando')
    setMensagemErro('')

    const resultado = await enviarMensagemManual({
      clienteId: cliente.clienteId || cliente.id,
      textoMensagem: textoTrim,
      requestId: requestIdRef.current,
    })

    enviandoRef.current = false

    if (!resultado.ok) {
      // Falha de rede/timeout preserva o request_id — tentar novamente reaproveita a
      // mesma tentativa lógica, evitando duplicidade se o request original já tiver
      // chegado ao backend. Só uma nova abertura do modal gera um UUID novo.
      setMensagemErro(mensagemAmigavel(resultado.error_code))
      setEstado('erro')
      return
    }

    const json = resultado.json

    // Falha no backend — erro controlado devolvido com success:false
    if (json?.success === false || json?.error_code) {
      requestIdRef.current = gerarUUID()
      setMensagemErro(mensagemAmigavel(json.error_code))
      setEstado('erro')
      return
    }

    // Template desconectado — envio não ocorreu por falta de ativação
    if (json?.status === 'not_sent' && json?.template_status === 'template_desconectado') {
      setEstado('sucesso_nao_ativado')
      return
    }

    // Sucesso confirmado — mensagem foi enviada de verdade
    // 'sucesso' é o valor real do contrato Builder (enviarMensagemGeralWhatsApp);
    // 'sent' preservado por compatibilidade com qualquer fluxo legado.
    if (
      json?.success === true &&
      (json?.status === 'sucesso' || json?.status === 'sent')
    ) {
      setEstado('sucesso_enviado')
      return
    }

    // Duplicidade idempotente — mensagem já tinha sido enviada, nenhum novo envio
    if (json?.success === true && (json?.status === 'ignored_duplicate' || json?.already_sent === true)) {
      setEstado('sucesso_duplicado')
      return
    }

    // Status inesperado — não caímos em nenhum cenário mapeado
    setEstado('erro_resultado_desconhecido')
    setMensagemErro('Não foi possível confirmar o resultado do envio.')
  }, [telefoneValido, textoValido, textoTrim, cliente])

  const podeEnviar = telefoneValido && textoValido && estado !== 'enviando'

  return (
    <div
      onClick={() => { if (estado !== 'enviando') onClose?.() }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000, padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: t.bg, borderRadius: 12, width: '100%', maxWidth: 440,
          maxHeight: '90vh', overflowY: 'auto', border: `1px solid ${t.border}`,
          boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
        }}
      >
        {/* Cabeçalho */}
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${t.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: t.text }}>✉️ Enviar mensagem pelo WhatsApp</span>
          <button
            onClick={() => { if (estado !== 'enviando') onClose?.() }}
            disabled={estado === 'enviando'}
            style={{ border: 'none', background: 'none', fontSize: 18, cursor: estado === 'enviando' ? 'not-allowed' : 'pointer', color: t.textMuted, opacity: estado === 'enviando' ? 0.5 : 1 }}
          >
            ✕
          </button>
        </div>

        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Cliente selecionado — somente leitura */}
          <div style={{ background: t.bgSecondary, borderRadius: 8, padding: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: t.text }}>{cliente?.nome || 'Sem nome'}</div>
            <div style={{ fontSize: 11, color: t.textMuted, marginTop: 2 }}>
              {telefoneValido ? maskPhone(cliente.telefone) : 'Sem telefone cadastrado'}
            </div>
          </div>

          {estado === 'sucesso_enviado' ? (
            <div style={{ background: '#D4EDDA', border: '1px solid #C3E6CB', borderRadius: 8, padding: 14, fontSize: 12.5, color: '#155724', lineHeight: 1.5 }}>
              ✅ Mensagem enviada com sucesso.
            </div>
          ) : estado === 'sucesso_duplicado' ? (
            <div style={{ background: '#D4EDDA', border: '1px solid #C3E6CB', borderRadius: 8, padding: 14, fontSize: 12.5, color: '#155724', lineHeight: 1.5 }}>
              ✅ Esta mensagem já havia sido enviada. Nenhum novo envio foi realizado.
            </div>
          ) : estado === 'sucesso_nao_ativado' ? (
            <div style={{ background: t.primaryBg, border: `1px solid ${t.primary}`, borderRadius: 8, padding: 14, fontSize: 12.5, color: t.text, lineHeight: 1.5 }}>
              ⚠️ Envio ainda não ativado. A interface foi validada, mas o template de Mensagem Manual continua desconectado.
            </div>
          ) : (
            <>
              {/* Campo de mensagem */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: t.textMid, display: 'block', marginBottom: 6 }}>
                  Mensagem
                </label>
                <textarea
                  value={texto}
                  onChange={e => setTexto(e.target.value.slice(0, TEXTO_MAX))}
                  disabled={estado === 'enviando'}
                  placeholder="Digite sua mensagem..."
                  rows={4}
                  style={{
                    width: '100%', border: `1px solid ${t.border}`, borderRadius: 7,
                    padding: '8px 10px', fontSize: 13, background: t.inputBg, color: t.text,
                    outline: 'none', resize: 'vertical', fontFamily: 'inherit',
                    opacity: estado === 'enviando' ? 0.6 : 1,
                  }}
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
                  <span style={{ fontSize: 10, color: textoTrim.length > TEXTO_MAX - 100 ? t.primary : t.textMuted }}>
                    {textoTrim.length}/{TEXTO_MAX}
                  </span>
                </div>
              </div>

              {/* Preview estilo WhatsApp */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: t.textMid, marginBottom: 6 }}>Prévia</div>
                <div style={{ background: t.bgTertiary, borderRadius: 8, padding: 12 }}>
                  <div style={{
                    background: t.bubbleUser, borderRadius: '8px 8px 8px 2px', padding: '8px 10px',
                    fontSize: 12.5, color: t.text, lineHeight: 1.5, maxWidth: '90%', whiteSpace: 'pre-wrap',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
                  }}>
                    {`Olá, ${primeiroNome}! 👋\n\n${textoTrim || '(sua mensagem aparecerá aqui)'}\n\nAtenciosamente,\nEquipe PRIME\nPRIME STORE`}
                  </div>
                </div>
                <div style={{ fontSize: 10, color: t.textMuted, marginTop: 6, fontStyle: 'italic' }}>
                  Prévia aproximada. O texto final será montado pelo template salvo no sistema.
                </div>
              </div>

              {!telefoneValido && (
                <div style={{ fontSize: 11.5, color: t.primary, background: t.primaryBg, borderRadius: 6, padding: '8px 10px' }}>
                  ⚠️ Cliente sem telefone válido cadastrado — não é possível enviar.
                </div>
              )}

              {(estado === 'erro' || estado === 'erro_resultado_desconhecido') && (
                <div style={{ fontSize: 11.5, color: t.primary, background: t.primaryBg, borderRadius: 6, padding: '8px 10px' }}>
                  ❌ {mensagemErro}
                </div>
              )}
            </>
          )}
        </div>

        {/* Ações */}
        <div style={{ padding: '14px 20px', borderTop: `1px solid ${t.border}`, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            onClick={() => { if (estado !== 'enviando') onClose?.() }}
            disabled={estado === 'enviando'}
            style={{
              fontSize: 12, fontWeight: 600, padding: '8px 16px', borderRadius: 7,
              border: 'none', cursor: estado === 'enviando' ? 'not-allowed' : 'pointer',
              background: t.bgTertiary, color: t.textMid, opacity: estado === 'enviando' ? 0.6 : 1,
            }}
          >
            {['sucesso_enviado', 'sucesso_duplicado', 'sucesso_nao_ativado'].includes(estado) ? 'Fechar' : 'Cancelar'}
          </button>
          {!['sucesso_enviado', 'sucesso_duplicado', 'sucesso_nao_ativado'].includes(estado) && (
            <button
              onClick={handleEnviar}
              disabled={!podeEnviar}
              title={!telefoneValido ? 'Cliente sem telefone válido' : (!textoValido ? 'Digite uma mensagem entre 2 e 2000 caracteres' : '')}
              style={{
                fontSize: 12, fontWeight: 600, padding: '8px 16px', borderRadius: 7,
                border: 'none', cursor: podeEnviar ? 'pointer' : 'not-allowed',
                background: podeEnviar ? (t.primary || '#E8192C') : t.bgTertiary,
                color: podeEnviar ? '#fff' : t.textMuted,
              }}
            >
              {estado === 'enviando' ? 'Enviando...' : 'Enviar'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
