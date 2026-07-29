import { useState, useEffect, useCallback, useRef } from 'react'
import { ArrowLeft, ArrowRight, Sparkles, PenLine, AlertTriangle, MessageCircle, Send, CheckCircle2 } from 'lucide-react'
import EnviarMensagemManualModal from './EnviarMensagemManualModal'
import { listarTemplatesWhatsapp, previsualizarMensagemWhatsapp, enviarMensagemManual } from '../../services/crm/cobrancasService'

// Fase 3 — o botão "Enviar WhatsApp" da prévia chama EXATAMENTE o mesmo serviço já usado
// por EnviarMensagemManualModal.jsx (enviarMensagemManual → proxy mensagem-manual →
// enviarMensagemManualWhatsapp → whatsappProvider → ZAP-API). Nenhum novo endpoint,
// nenhuma chamada direta a whatsappProvider pelo frontend. Payload é sempre o contrato
// mínimo já aceito hoje: { cliente_id, texto_mensagem, request_id } — template_key/
// parcela_id NÃO são enviados (o backend rejeita campos fora da allowlist hoje; ver
// nota no relatório desta fase). O texto enviado é sempre o texto editável da prévia,
// nunca recalculado a partir do template/parcela no momento do envio.

function gerarUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

// Mesmo mapeamento amigável já usado em EnviarMensagemManualModal.jsx pro envio real.
function mensagemErroEnvioAmigavel(errorCode) {
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

// Badges discretos por template (Refinamento de UX) — só rótulo visual, nunca decide
// nada de negócio. Template sem entrada aqui simplesmente não mostra badge.
const TEMPLATE_BADGES = {
  lembrete_automatico: { label: 'Recomendado', color: '#059669', bg: '#ECFDF5' },
  pagamento_confirmado: { label: 'Pagamento', color: '#2563EB', bg: '#EFF6FF' },
}

// Modal único de entrada pro envio de WhatsApp — troca de CONTEÚDO por etapa (nunca
// abre um modal sobre o outro). Duas opções na raiz:
//   - "Mensagem pronta"  → escolhe parcela (se houver mais de uma) → escolhe template
//     (listar_templates) → prévia editável (previsualizar) — Fase 2: só revisão visual,
//     o envio real do template fica pra uma fase futura (não implementado aqui).
//   - "Mensagem personalizada" → delega 100% pro EnviarMensagemManualModal existente,
//     sem nenhuma alteração nele — mesmo componente, mesmo pipeline já validado.
//
// `parcelas` é sempre um array (pode vir vazio, com 1 ou com várias) — quem monta este
// componente decide a origem: lista agregada por cliente (ClientesEmCobrancaTab) ou uma
// única parcela já em contexto (ParcelasTab). Nunca resolve valor/vencimento/PIX aqui —
// isso é sempre resposta do backend (previsualizarMensagemWhatsapp → Base44).

function formatCurrency(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0)
}

function maskPhone(phone) {
  const digits = (phone || '').replace(/\D/g, '')
  if (digits.length < 6) return '***'
  return digits.substring(0, 2) + '*'.repeat(digits.length - 6) + digits.substring(digits.length - 4)
}

// Mapeamento amigável — nunca expõe error_code cru na tela.
function mensagemErroAmigavel(errorCode) {
  const mapa = {
    cliente_nao_encontrado: 'Cliente não encontrado no PRIME Cobranças.',
    parcela_nao_encontrada: 'Parcela não encontrada para este cliente.',
    template_key_invalido: 'Este template não está disponível no momento.',
    missing_service_token: 'Serviço indisponível no momento. Tente novamente em instantes.',
    timeout_base44: 'O serviço demorou para responder. Tente novamente.',
    erro_rede_base44: 'Não foi possível conectar. Verifique sua internet.',
  }
  return mapa[errorCode] || 'Não foi possível carregar as informações agora.'
}

export default function WhatsAppSendModal({ cliente, parcelas = [], theme: t, onClose }) {
  const [step, setStep] = useState('escolha') // escolha | escolherParcela | escolherTemplate | previa | personalizada
  const [parcelaEscolhida, setParcelaEscolhida] = useState(parcelas.length === 1 ? parcelas[0] : null)

  const [templates, setTemplates] = useState(null)
  const [carregandoTemplates, setCarregandoTemplates] = useState(false)
  const [erroTemplates, setErroTemplates] = useState('')

  const [templateEscolhido, setTemplateEscolhido] = useState(null)
  const [previa, setPrevia] = useState(null)
  const [carregandoPrevia, setCarregandoPrevia] = useState(false)
  const [erroPrevia, setErroPrevia] = useState('')
  const [textoEditavel, setTextoEditavel] = useState('')

  const [enviando, setEnviando] = useState(false)
  const [erroEnvio, setErroEnvio] = useState('')
  const [enviado, setEnviado] = useState(false)
  const enviandoRef = useRef(false) // trava contra duplo clique — mesma técnica do modal legado
  const requestIdRef = useRef(null)

  const clienteId = cliente?.clienteId || cliente?.id
  const telefoneValido = Boolean(cliente?.telefone && cliente.telefone !== '-')

  const fecharTudo = useCallback(() => { if (!enviando) onClose?.() }, [onClose, enviando])

  // Fecha com ESC — exceto durante carregamento/envio, pra não perder uma requisição em voo.
  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape' && !carregandoTemplates && !carregandoPrevia && !enviando) fecharTudo()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [carregandoTemplates, carregandoPrevia, enviando, fecharTudo])

  const irParaMensagemPronta = useCallback(async () => {
    if (parcelas.length > 1) {
      setStep('escolherParcela')
      return
    }
    // 0 ou 1 parcela — não há o que escolher, segue direto (0 vira estado vazio na tela seguinte).
    setStep('escolherTemplate')
    setCarregandoTemplates(true)
    setErroTemplates('')
    const resultado = await listarTemplatesWhatsapp()
    setCarregandoTemplates(false)
    if (!resultado.ok || resultado.json?.success !== true) {
      setErroTemplates(mensagemErroAmigavel(resultado.json?.error_code || resultado.error_code))
      return
    }
    setTemplates(resultado.json.templates || [])
  }, [parcelas])

  const escolherParcela = useCallback(async (p) => {
    setParcelaEscolhida(p)
    setStep('escolherTemplate')
    setCarregandoTemplates(true)
    setErroTemplates('')
    const resultado = await listarTemplatesWhatsapp()
    setCarregandoTemplates(false)
    if (!resultado.ok || resultado.json?.success !== true) {
      setErroTemplates(mensagemErroAmigavel(resultado.json?.error_code || resultado.error_code))
      return
    }
    setTemplates(resultado.json.templates || [])
  }, [])

  const escolherTemplate = useCallback(async (tpl) => {
    setTemplateEscolhido(tpl)
    setStep('previa')
    setCarregandoPrevia(true)
    setErroPrevia('')
    setPrevia(null)
    const resultado = await previsualizarMensagemWhatsapp({
      clienteId,
      parcelaId: parcelaEscolhida?.id,
      templateKey: tpl.key,
    })
    setCarregandoPrevia(false)
    if (!resultado.ok || resultado.json?.success !== true) {
      setErroPrevia(mensagemErroAmigavel(resultado.json?.error_code || resultado.error_code))
      return
    }
    setPrevia(resultado.json)
    setTextoEditavel(resultado.json.texto_renderizado || '')
    // Novo request_id a cada prévia carregada — nunca reaproveita idempotency_key de
    // uma tentativa anterior (mesmo template ou não).
    requestIdRef.current = gerarUUID()
    setEnviado(false)
    setErroEnvio('')
  }, [clienteId, parcelaEscolhida])

  const enviarWhatsapp = useCallback(async () => {
    if (enviandoRef.current) return // trava contra duplo clique
    const textoTrim = (textoEditavel || '').trim()
    if (textoTrim.length < 2) {
      setErroEnvio('Digite uma mensagem antes de enviar.')
      return
    }
    if (!requestIdRef.current) requestIdRef.current = gerarUUID()

    enviandoRef.current = true
    setEnviando(true)
    setErroEnvio('')

    const resultado = await enviarMensagemManual({
      clienteId,
      textoMensagem: textoTrim,
      requestId: requestIdRef.current,
    })

    enviandoRef.current = false
    setEnviando(false)

    if (!resultado.ok) {
      // Falha de rede/timeout preserva o request_id — reduz risco de duplicidade se a
      // requisição original já tiver chegado ao backend (mesmo comportamento do modal legado).
      setErroEnvio(mensagemErroEnvioAmigavel(resultado.error_code))
      return
    }

    const json = resultado.json
    if (json?.success === false || json?.error_code) {
      // Erro controlado do backend — só aqui troca o request_id (nova tentativa lógica).
      requestIdRef.current = gerarUUID()
      setErroEnvio(mensagemErroEnvioAmigavel(json.error_code))
      return
    }

    if (json?.success === true && (json?.status === 'sent' || json?.status === 'ignored_duplicate' || json?.already_sent === true)) {
      setEnviado(true)
      return
    }

    setErroEnvio('Não foi possível confirmar o resultado do envio.')
  }, [clienteId, textoEditavel])

  const voltar = useCallback(() => {
    setEnviado(false)
    setErroEnvio('')
    if (step === 'previa') { setStep('escolherTemplate'); return }
    if (step === 'escolherTemplate') {
      setStep(parcelas.length > 1 ? 'escolherParcela' : 'escolha')
      return
    }
    if (step === 'escolherParcela') { setStep('escolha'); return }
    fecharTudo()
  }, [step, parcelas.length, fecharTudo])

  // --- Delegação total pro modal existente — sem alteração, sem duplicação. ---
  if (step === 'personalizada') {
    return <EnviarMensagemManualModal cliente={cliente} theme={t} onClose={onClose} />
  }

  const podeVoltar = step !== 'escolha'
  const carregando = carregandoTemplates || carregandoPrevia || enviando

  return (
    <div
      onClick={() => { if (!carregando) fecharTudo() }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000, padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: t.bg, borderRadius: 16, width: '100%', maxWidth: 460,
          maxHeight: '90vh', overflowY: 'auto', border: `1px solid ${t.border}`,
          boxShadow: '0 24px 64px rgba(0,0,0,0.28)',
        }}
      >
        {/* Cabeçalho — sempre o mesmo shell, só o título muda por etapa */}
        <div style={{ padding: '18px 22px', borderBottom: `1px solid ${t.border}`, display: 'flex', alignItems: 'center', gap: 10 }}>
          {podeVoltar ? (
            <button
              onClick={voltar}
              disabled={carregando}
              title="Voltar"
              style={{
                border: 'none', background: 'none', cursor: carregando ? 'not-allowed' : 'pointer',
                color: t.textMid, display: 'flex', alignItems: 'center', padding: 4, borderRadius: 6,
                opacity: carregando ? 0.5 : 1,
              }}
            >
              <ArrowLeft size={17} strokeWidth={2} />
            </button>
          ) : (
            <MessageCircle size={17} strokeWidth={2} style={{ color: t.primary || '#E8192C' }} />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: t.text }}>
              {step === 'escolha' && 'Enviar mensagem'}
              {step === 'escolherParcela' && 'Escolha a parcela'}
              {step === 'escolherTemplate' && 'Escolha o template'}
              {step === 'previa' && 'Prévia da mensagem'}
            </div>
            <div style={{ fontSize: 11.5, color: t.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {cliente?.nome || 'Sem nome'} · {telefoneValido ? maskPhone(cliente.telefone) : 'Sem telefone cadastrado'}
            </div>
          </div>
          <button
            onClick={() => { if (!carregando) fecharTudo() }}
            disabled={carregando}
            style={{ border: 'none', background: 'none', fontSize: 18, cursor: carregando ? 'not-allowed' : 'pointer', color: t.textMuted, opacity: carregando ? 0.5 : 1 }}
          >
            ✕
          </button>
        </div>

        <div style={{ padding: 22 }}>
          {step === 'escolha' && (
            <EscolhaInicial t={t} telefoneValido={telefoneValido} onMensagemPronta={irParaMensagemPronta} onMensagemPersonalizada={() => setStep('personalizada')} />
          )}

          {step === 'escolherParcela' && (
            <EscolherParcela t={t} parcelas={parcelas} onEscolher={escolherParcela} />
          )}

          {step === 'escolherTemplate' && (
            <EscolherTemplate
              t={t}
              parcela={parcelaEscolhida}
              carregando={carregandoTemplates}
              erro={erroTemplates}
              templates={templates}
              onEscolher={escolherTemplate}
            />
          )}

          {step === 'previa' && (
            <Previa
              t={t}
              cliente={cliente}
              telefoneValido={telefoneValido}
              parcela={parcelaEscolhida}
              templateNome={templateEscolhido?.nome}
              carregando={carregandoPrevia}
              erro={erroPrevia}
              previa={previa}
              texto={textoEditavel}
              onTextoChange={setTextoEditavel}
              enviando={enviando}
              erroEnvio={erroEnvio}
              enviado={enviado}
              onEnviar={enviarWhatsapp}
              onFechar={fecharTudo}
            />
          )}
        </div>
      </div>
    </div>
  )
}

function CardEscolha({ t, icone, titulo, descricao, onClick, disabled }) {
  const [hover, setHover] = useState(false)
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 14,
        padding: '18px 18px', borderRadius: 13, cursor: disabled ? 'not-allowed' : 'pointer',
        border: `1.5px solid ${hover && !disabled ? (t.primary || '#E8192C') : t.border}`,
        background: hover && !disabled ? (t.primaryBg || t.bgSecondary) : t.bgSecondary,
        transition: 'border-color 0.15s, background 0.15s',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <div style={{
        width: 40, height: 40, borderRadius: 10, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: t.bgTertiary, color: t.primary || '#E8192C',
      }}>
        {icone}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: t.text }}>{titulo}</div>
        <div style={{ fontSize: 12, color: t.textMuted, marginTop: 2 }}>{descricao}</div>
      </div>
      <ArrowRight size={16} strokeWidth={2} style={{ color: t.textMuted, flexShrink: 0 }} />
    </button>
  )
}

function EscolhaInicial({ t, telefoneValido, onMensagemPronta, onMensagemPersonalizada }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {!telefoneValido && (
        <div style={{ fontSize: 11.5, color: t.primary, background: t.primaryBg, borderRadius: 8, padding: '10px 12px', marginBottom: 2 }}>
          ⚠️ Cliente sem telefone válido cadastrado — não é possível enviar.
        </div>
      )}
      <CardEscolha
        t={t}
        icone={<Sparkles size={19} strokeWidth={2} />}
        titulo="Mensagem pronta"
        descricao="Usar um template oficial do PRIME Cobranças."
        onClick={onMensagemPronta}
        disabled={!telefoneValido}
      />
      <CardEscolha
        t={t}
        icone={<PenLine size={19} strokeWidth={2} />}
        titulo="Mensagem personalizada"
        descricao="Escrever qualquer mensagem."
        onClick={onMensagemPersonalizada}
        disabled={!telefoneValido}
      />
    </div>
  )
}

function EscolherParcela({ t, parcelas, onEscolher }) {
  if (!parcelas || parcelas.length === 0) {
    return <EstadoVazio t={t} texto="Nenhuma parcela em aberto encontrada para este cliente." />
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 360, overflowY: 'auto' }}>
      {parcelas.map((p, i) => (
        <button
          key={p.id || i}
          onClick={() => onEscolher(p)}
          style={{
            textAlign: 'left', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '13px 14px', borderRadius: 11, border: `1px solid ${t.border}`,
            background: t.bgSecondary, cursor: 'pointer',
          }}
        >
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: t.text }}>{p.parcelas || 'Parcela'}</div>
            <div style={{ fontSize: 11.5, color: t.textMuted, marginTop: 3 }}>Vence {p.vencimento}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: t.text }}>{formatCurrency(p.valorAberto ?? p.valorTotal)}</div>
            {p.diasAtraso > 0 && (
              <div style={{ fontSize: 11, color: '#DC2626', marginTop: 2 }}>{p.diasAtraso}d de atraso</div>
            )}
          </div>
        </button>
      ))}
    </div>
  )
}

function EscolherTemplate({ t, carregando, erro, templates, onEscolher }) {
  if (carregando) return <EstadoCarregando t={t} texto="Carregando templates..." />
  if (erro) return <EstadoErro t={t} texto={erro} />
  if (!templates || templates.length === 0) {
    return <EstadoVazio t={t} texto="Nenhum template disponível no momento." />
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {templates.map(tpl => {
        const badge = TEMPLATE_BADGES[tpl.key]
        return (
          <button
            key={tpl.key}
            onClick={() => onEscolher(tpl)}
            style={{
              textAlign: 'left', padding: '14px 15px', borderRadius: 11,
              border: `1px solid ${t.border}`, background: t.bgSecondary, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: t.text }}>{tpl.nome}</div>
                {badge && (
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                    background: badge.bg, color: badge.color, flexShrink: 0,
                  }}>
                    {badge.label}
                  </span>
                )}
              </div>
              {tpl.descricao && (
                <div style={{ fontSize: 11.5, color: t.textMuted, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {tpl.descricao}
                </div>
              )}
            </div>
            <ArrowRight size={15} strokeWidth={2} style={{ color: t.textMuted, flexShrink: 0 }} />
          </button>
        )
      })}
    </div>
  )
}

// Rótulo de status da parcela — mesmos critérios já usados no resto da tela (diasAtraso
// > 0 vence tudo, senão status/valorPago decidem). Não recalcula nada novo, só formata.
function statusParcelaInfo(p) {
  if (!p) return null
  if (p.diasAtraso > 0) return { label: `${p.diasAtraso}d de atraso`, color: '#DC2626', bg: '#FEF2F2' }
  if (p.status === 'pago' || (p.valorAberto != null && p.valorAberto <= 0)) return { label: 'Paga', color: '#059669', bg: '#ECFDF5' }
  if (p.valorPago > 0) return { label: 'Parcial', color: '#B45309', bg: '#FFFBEB' }
  return { label: 'Em dia', color: '#059669', bg: '#ECFDF5' }
}

function CardInfo({ t, titulo, children }) {
  return (
    <div style={{ background: t.bgTertiary, borderRadius: 10, padding: '11px 14px', flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: t.textMuted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>
        {titulo}
      </div>
      {children}
    </div>
  )
}

function Previa({ t, cliente, telefoneValido, parcela, templateNome, carregando, erro, previa, texto, onTextoChange, enviando, erroEnvio, enviado, onEnviar, onFechar }) {
  if (carregando) return <EstadoCarregando t={t} texto="Montando a prévia..." />
  if (erro) return <EstadoErro t={t} texto={erro} />
  if (!previa) return null

  const incompleta = previa.status !== 'ready'
  const status = statusParcelaInfo(parcela)
  const podeEnviar = !incompleta && !enviando && !enviado

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {incompleta && (
        <div style={{ fontSize: 11.5, color: '#B45309', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, padding: '10px 12px', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <AlertTriangle size={14} strokeWidth={2} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            Mensagem incompleta — faltam: {(previa.variaveis_faltantes || []).join(', ') || 'dados necessários'}.
            Escolha outro template ou use "Mensagem personalizada".
          </span>
        </div>
      )}

      <div style={{ display: 'flex', gap: 10 }}>
        <CardInfo t={t} titulo="Cliente">
          <div style={{ fontSize: 13, fontWeight: 700, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {cliente?.nome || 'Sem nome'}
          </div>
          <div style={{ fontSize: 11.5, color: t.textMuted, marginTop: 2 }}>
            {telefoneValido ? maskPhone(cliente.telefone) : 'Sem telefone'}
          </div>
        </CardInfo>

        {parcela && (
          <CardInfo t={t} titulo="Parcela">
            <div style={{ fontSize: 13, fontWeight: 700, color: t.text }}>
              {parcela.parcelas || 'Parcela única'} · {formatCurrency(parcela.valorAberto ?? parcela.valorTotal)}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
              <span style={{ fontSize: 11.5, color: t.textMuted }}>Vence {parcela.vencimento}</span>
              {status && (
                <span style={{ fontSize: 10, fontWeight: 700, padding: '1.5px 7px', borderRadius: 20, background: status.bg, color: status.color }}>
                  {status.label}
                </span>
              )}
            </div>
          </CardInfo>
        )}
      </div>

      {enviado ? (
        <div style={{ background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: 10, padding: '14px 16px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <CheckCircle2 size={18} strokeWidth={2} style={{ color: '#059669', flexShrink: 0, marginTop: 1 }} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#065F46' }}>Mensagem enviada com sucesso</div>
            <div style={{ fontSize: 11.5, color: '#047857', marginTop: 2 }}>O WhatsApp foi enviado pelo pipeline já validado.</div>
          </div>
        </div>
      ) : (
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: t.textMid, marginBottom: 6 }}>
            {templateNome} — texto editável
          </div>
          <textarea
            value={texto}
            onChange={e => onTextoChange(e.target.value)}
            disabled={incompleta || enviando}
            rows={7}
            style={{
              width: '100%', border: `1px solid ${t.border}`, borderRadius: 9,
              padding: '10px 12px', fontSize: 13, background: t.inputBg, color: t.text,
              outline: 'none', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5,
              opacity: (incompleta || enviando) ? 0.6 : 1,
            }}
          />
        </div>
      )}

      {erroEnvio && !enviado && (
        <div style={{ fontSize: 11.5, color: t.primary, background: t.primaryBg, borderRadius: 8, padding: '10px 12px' }}>
          ❌ {erroEnvio}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        {enviado ? (
          <button
            onClick={onFechar}
            style={{
              fontSize: 12.5, fontWeight: 600, padding: '9px 18px', borderRadius: 8,
              border: 'none', cursor: 'pointer', background: t.primary || '#E8192C', color: '#fff',
            }}
          >
            Fechar
          </button>
        ) : (
          <button
            onClick={onEnviar}
            disabled={!podeEnviar}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              fontSize: 12.5, fontWeight: 600, padding: '9px 18px', borderRadius: 8,
              border: 'none', cursor: podeEnviar ? 'pointer' : 'not-allowed',
              background: podeEnviar ? (t.primary || '#E8192C') : t.bgTertiary,
              color: podeEnviar ? '#fff' : t.textMuted,
            }}
          >
            <Send size={14} strokeWidth={2} />
            {enviando ? 'Enviando...' : 'Enviar WhatsApp'}
          </button>
        )}
      </div>
    </div>
  )
}

function EstadoCarregando({ t, texto }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '32px 8px' }}>
      <div style={{
        width: 22, height: 22, borderRadius: '50%', border: `2.5px solid ${t.border}`,
        borderTopColor: t.primary || '#E8192C', animation: 'whatsapp-modal-spin 0.7s linear infinite',
      }} />
      <div style={{ fontSize: 12.5, color: t.textMuted }}>{texto}</div>
      <style>{`@keyframes whatsapp-modal-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

function EstadoErro({ t, texto }) {
  return (
    <div style={{ fontSize: 12, color: t.primary, background: t.primaryBg, borderRadius: 8, padding: '12px 14px', textAlign: 'center' }}>
      ❌ {texto}
    </div>
  )
}

function EstadoVazio({ t, texto }) {
  return (
    <div style={{ fontSize: 12, color: t.textMuted, textAlign: 'center', padding: '24px 8px' }}>
      {texto}
    </div>
  )
}
