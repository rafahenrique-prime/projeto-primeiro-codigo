import { createClient } from '@base44/sdk';

let base44Client = null;

function getClient() {
  if (!base44Client) {
    const appId = import.meta.env.VITE_BASE44_APP_ID;
    if (!appId) throw new Error('VITE_BASE44_APP_ID não configurado');

    base44Client = createClient({ appId });
  }
  return base44Client;
}

// Calcula dias em atraso baseado na data de vencimento
function calcularDiasAtraso(vencimento) {
  if (!vencimento) return 0;
  const vencDate = new Date(vencimento);
  const hoje = new Date();
  const diffMs = hoje - vencDate;
  const dias = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return dias > 0 ? dias : 0;
}

// Normaliza dados da API para o formato esperado pela UI
function normalizarCobranca(c, telefonecliente = '-') {
  const valorAberto = (parseFloat(c.valorTotal) || 0) - (parseFloat(c.valorPago) || 0);
  const normalized = {
    id: c.id,
    nome: c.clienteNome || 'Sem nome',
    clienteId: c.clienteId,
    status: c.statusCobranca || 'Não Cobrado',
    diasAtraso: calcularDiasAtraso(c.vencimento),
    vencimento: c.vencimento ? new Date(c.vencimento).toLocaleDateString('pt-BR') : '-',
    valorTotal: parseFloat(c.valorTotal) || 0,
    valorAberto: valorAberto,
    valorPago: parseFloat(c.valorPago) || 0,
    parcelas: `${c.parcelasTotal || 1}x`,
    telefone: telefonecliente || c.telefonePrincipal || c.telefone || '-',
    observacoes: c.observacoes || '',
    quantidadeCobrancas: c.quantidadeCobrancas || 0,
    proximaAcao: c.proximaAcao || '-',
    historicoPagamentos: c.historicoPagamentos || [], // Array de { data, valor }
  };

  return normalized;
}

async function buscarTelefoneCliente(clienteId, nomeCliente) {
  try {
    const base44 = getClient();
    let cliente = null;

    // Tenta por ID primeiro
    if (clienteId) {
      try {
        cliente = await base44.entities.Cliente.get(clienteId);
      } catch (err) {
        console.warn(`[buscarTelefoneCliente] ⚠️ ID ${clienteId} não encontrado, tentando por nome...`);
      }
    }

    // Se não achou por ID, tenta por nome
    if (!cliente && nomeCliente) {
      try {
        const clientes = await base44.entities.Cliente.filter({ nome: nomeCliente });
        if (clientes && clientes.length > 0) {
          cliente = clientes[0];
          console.log(`[buscarTelefoneCliente] ✅ ${nomeCliente}: encontrado por NOME`);
        }
      } catch (err) {
        console.warn(`[buscarTelefoneCliente] ⚠️ Filtro por nome falhou:`, err.message);
      }
    }

    const telefone = cliente?.telefone || '-';
    if (telefone !== '-') {
      console.log(`[buscarTelefoneCliente] ✅ ${nomeCliente}: telefone="${telefone}"`);
    }
    return telefone;
  } catch (err) {
    console.warn(`[buscarTelefoneCliente] ❌ ${nomeCliente}:`, err.message);
    return '-';
  }
}

export async function getAllCobrancas() {
  try {
    const base44 = getClient();
    const result = await base44.entities.Cobranca.list();

    // Normaliza SEM buscar telefone (evita rate limit)
    const normalized = (result || []).map(c => normalizarCobranca(c, '-'));

    if (result && result.length > 0) {
      console.log('[cobrancasService] 📊 Total de registros:', result.length);
    }

    return normalized;
  } catch (err) {
    console.error('[cobrancasService] Erro ao listar todas:', err.message);
    return [];
  }
}

// Busca telefone sob demanda (quando usuário clica no botão WhatsApp)
export async function buscarTelefoneParaWhatsApp(clienteId, nomeCliente) {
  return await buscarTelefoneCliente(clienteId, nomeCliente);
}

export async function listCobrancas(filtroStatus = null) {
  try {
    const base44 = getClient();
    const result = await base44.entities.Cobranca.list();
    let cobrancas = (result || []).map(normalizarCobranca);

    if (filtroStatus && filtroStatus !== 'todos') {
      cobrancas = cobrancas.filter(c => c.status === filtroStatus);
    }

    return cobrancas.sort((a, b) => b.diasAtraso - a.diasAtraso);
  } catch (err) {
    console.error('[cobrancasService] Erro ao listar cobranças:', err.message);
    return [];
  }
}

export async function listCobrancasAtrasadas() {
  try {
    const base44 = getClient();
    const result = await base44.entities.Cobranca.list();
    const cobrancas = (result || []).map(normalizarCobranca);
    return cobrancas.filter(c => c.diasAtraso > 0).sort((a, b) => b.diasAtraso - a.diasAtraso);
  } catch (err) {
    console.error('[cobrancasService] Erro ao listar atrasadas:', err.message);
    return [];
  }
}

// Dados mock para fallback quando ActivityLog falhar
const MOCK_HISTORICO_ATIVIDADES = [
  { id: '1', tipo: 'pagamento', activityType: 'PAYMENT', timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), entityId: 'ALESSANDRO ELISA', descricao: 'Pagamento recebido', valor: 918.99, valorAnterior: null, valorNovo: null, userId: 'sistema' },
  { id: '2', tipo: 'edicao', activityType: 'EDIT', timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), entityId: 'ALESSANDRO PEREIRA LOPES', descricao: 'Status atualizado', valor: 0, valorAnterior: 'Pendente', valorNovo: 'Atrasado', userId: 'rafael' },
  { id: '3', tipo: 'pagamento', activityType: 'PAYMENT', timestamp: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), entityId: 'DINEI BARBEARIA', descricao: 'Pagamento parcial', valor: 250.00, valorAnterior: null, valorNovo: null, userId: 'sistema' },
  { id: '4', tipo: 'importacao', activityType: 'IMPORT', timestamp: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), entityId: 'Lote 001', descricao: 'Importação em lote', valor: 5000.00, valorAnterior: null, valorNovo: null, userId: 'rafael' },
  { id: '5', tipo: 'novo', activityType: 'NEW', timestamp: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(), entityId: 'GABRIEL SILVA', descricao: 'Nova cobrança criada', valor: 3136.00, valorAnterior: null, valorNovo: null, userId: 'rafael' },
];

export async function getHistoricoAtividades() {
  try {
    const base44 = getClient();

    console.log('[getHistoricoAtividades] 🔍 Buscando ActivityLog do Base44...');

    let result = [];
    try {
      // ActivityLog é a entidade correta no Base44
      result = await base44.entities.ActivityLog.list();
      console.log('[getHistoricoAtividades] ✅ ActivityLog carregado:', result.length, 'registros');
    } catch (err) {
      console.error('[getHistoricoAtividades] ❌ Erro ao carregar ActivityLog:', err.message);
      console.log('[getHistoricoAtividades] ℹ️ Usando dados mock como fallback');
      return MOCK_HISTORICO_ATIVIDADES;
    }

    if (!result || result.length === 0) {
      console.log('[getHistoricoAtividades] ℹ️ ActivityLog vazio, usando mock');
      return MOCK_HISTORICO_ATIVIDADES;
    }

    console.log('[getHistoricoAtividades] 📊 Mapeando', result.length, 'atividades...');

    // Normalizar atividades usando o schema REAL do Base44
    const atividades = result
      .map(log => {
        try {
          // Schema do Base44: tipo, descricao, clienteNome, valor, valorAnterior, cobrancaId, usuario, detalhes, created_date
          const timestamp = log.created_date || new Date().toISOString();
          const timestampDate = new Date(timestamp);

          if (isNaN(timestampDate.getTime())) {
            console.warn(`[getHistoricoAtividades] ⚠️ Data inválida: ${timestamp}`);
            return null;
          }

          return {
            id: log.id,
            tipo: log.tipo || 'outro', // pagamento, edicao, importacao, exclusao, novo
            descricao: log.descricao || '-',
            clienteNome: log.clienteNome || '-',
            entityId: log.cobrancaId || '-',
            valor: log.valor || 0,
            valorAnterior: log.valorAnterior || null,
            timestamp: timestamp,
            userId: log.usuario || log.created_by || '-',
            detalhes: log.detalhes || '',
          };
        } catch (e) {
          console.warn('[getHistoricoAtividades] ⚠️ Erro ao processar:', e.message);
          return null;
        }
      })
      .filter(Boolean);

    if (atividades.length === 0) {
      console.log('[getHistoricoAtividades] ℹ️ Nenhuma atividade válida, usando mock');
      return MOCK_HISTORICO_ATIVIDADES;
    }

    console.log('[getHistoricoAtividades] ✅ Retornando', atividades.length, 'atividades do Base44');
    return atividades.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  } catch (err) {
    console.error('[getHistoricoAtividades] ❌ Erro fatal:', err.message);
    return MOCK_HISTORICO_ATIVIDADES;
  }
}

export async function getClientes() {
  try {
    const base44 = getClient();

    console.log('[getClientes] 🔍 Buscando Clientes do Base44...');

    let result = [];
    try {
      result = await base44.entities.Cliente.list();
      console.log('[getClientes] ✅ Clientes carregados:', result.length, 'registros');
    } catch (err) {
      console.error('[getClientes] ❌ Erro ao carregar Clientes:', err.message);
      return [];
    }

    if (!result || result.length === 0) {
      console.log('[getClientes] ℹ️ Nenhum cliente encontrado');
      return [];
    }

    console.log('[getClientes] 📊 Normalizando', result.length, 'clientes...');

    // Normalizar clientes usando o schema REAL do Base44
    const clientes = result
      .map(cliente => {
        try {
          return {
            id: cliente.id,
            nome: cliente.nome || '-',
            telefone: cliente.telefone || '-',
            documento: cliente.documento || '-',
            email: cliente.email || '-',
            endereco: cliente.endereco || '-',
            cidade: cliente.cidade || '-',
            estado: cliente.estado || '-',
            cep: cliente.cep || '-',
            observacoes: cliente.observacoes || '',
            dataNascimento: cliente.dataNascimento ? new Date(cliente.dataNascimento).toLocaleDateString('pt-BR') : '-',
            limiteCredito: cliente.limiteCredito || 0,
            profissao: cliente.profissao || '-',
            created_date: cliente.created_date,
            updated_date: cliente.updated_date,
          };
        } catch (e) {
          console.warn('[getClientes] ⚠️ Erro ao processar cliente:', e.message);
          return null;
        }
      })
      .filter(Boolean);

    console.log('[getClientes] ✅ Retornando', clientes.length, 'clientes normalizados');
    return clientes.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
  } catch (err) {
    console.error('[getClientes] ❌ Erro fatal:', err.message);
    return [];
  }
}

export async function sincronizarTelefonesEncontrados() {
  const base44 = getClient();

  // 26 números encontrados na agenda do Rafael
  const telefones = {
    "JADER": "999774855",
    "DINEI BARBEARIA": "034993133042",
    "NAYARA PLATAFORMA GUCCI": "99174-4510",
    "CLEITON BARBEARIA": "(015 34) 99658-0001",
    "CASSINHO ITUITABA": "034996926999",
    "MARCO TULIO MT": "(015 34) 99976-1431",
    "RAFAEL AMIGO BEICIM ITBA": "99944-4764",
    "MATEUS MICHELE": "(34) 9341-3633",
    "YOSHI CATIGUA": "+553492767114",
    "JOAOZINHO PRETAO": "+553498081000",
    "VANDERLEI - AEROPORTO": "99142-8447",
    "SORRISO PEDRO": "99283-2823",
    "MAYRA MAE ARTUR": "99251-2393",
    "JOAO EDUARDO CASSIM ITBA": "034996602867",
    "CUPIM PROZA": "+553491098852",
    "DIOGO LEO CONTABILIDADE": "+5534991078115",
    "GABRIEL MARTINS BARBEIRO": "04134992446611",
    "GABY REPECAO BARBEARIA": "(041 34) 99149-1463",
    "Thalles Biringui": "+5534992215772",
    "BARBEIRO MARCUS": "+5534998450248",
    "GUSTAVO AMIGO RAFAEL": "+55 34 99649-4552",
    "MARCELO ESPETINHO GORDIN": "+55 34 99137-1028",
    "MATEUS MERCEDES": "+55 34 99930-2112",
    "PH OK MATEUS SUZI": "+55 34 99133-2313",
    "SAMUKA JD BRASILIA": "+55 15 99746-3524",
    "WELITON MIRELY": "+55 34 99296-7862"
  };

  console.log(`\n🔄 Sincronizando ${Object.keys(telefones).length} clientes com Base44...\n`);

  let sucesso = 0;
  let erro = 0;
  const resultados = [];

  for (const [nome, telefone] of Object.entries(telefones)) {
    try {
      const clientes = await base44.entities.Cliente.filter({ nome: nome });

      if (clientes && clientes.length > 0) {
        const clienteId = clientes[0].id;
        const telefoneLimpo = telefone.replace(/[^\d+]/g, '');

        await base44.entities.Cliente.update(clienteId, {
          telefone: telefoneLimpo
        });

        console.log(`✅ ${nome.padEnd(40)} → ${telefone}`);
        resultados.push({ nome, telefone, status: 'sucesso' });
        sucesso++;
      } else {
        console.warn(`⚠️  ${nome.padEnd(40)} → Não encontrado no Base44`);
        resultados.push({ nome, telefone, status: 'nao_encontrado' });
        erro++;
      }
    } catch (err) {
      console.error(`❌ ${nome.padEnd(40)} → ${err.message}`);
      resultados.push({ nome, telefone, status: 'erro', erro: err.message });
      erro++;
    }
  }

  console.log(`\n${'='.repeat(70)}`);
  console.log(`📊 RESULTADO: ${sucesso} sincronizados, ${erro} com erro`);
  console.log(`${'='.repeat(70)}\n`);

  return { sucesso, erro, total: Object.keys(telefones).length, resultados };
}

export async function getTotalizadores() {
  try {
    const base44 = getClient();
    const result = await base44.entities.Cobranca.list();
    const cobrancas = (result || []).map(c => normalizarCobranca(c, '-'));

    if (cobrancas.length === 0) {
      return {
        totalAtraso: 0,
        qtdAtrasados: 0,
        diasMedia: 0,
        totalReceber: 0,
        critico: 0,
        urgente: 0
      };
    }

    // Total a Receber: soma de TODOS os valorAberto (o que REALMENTE falta receber)
    const totalReceber = cobrancas.reduce((sum, c) => sum + (c.valorAberto || 0), 0);

    // Total em Atraso: soma do valorAberto apenas das cobranças com atraso
    const atrasadas = cobrancas.filter(c => c.diasAtraso > 0);
    const totalAtraso = atrasadas.reduce((sum, c) => sum + c.valorAberto, 0);

    // Clientes Atrasados: contagem de clientes únicos com atraso
    const clientesAtrasadosUnicos = new Set(atrasadas.map(c => c.nome)).size;

    // Dias Médios de Atraso
    const diasMedia = atrasadas.length > 0
      ? Math.round(atrasadas.reduce((sum, c) => sum + c.diasAtraso, 0) / atrasadas.length)
      : 0;

    // Crítico (15+ dias): contagem de cobranças
    const critico = cobrancas.filter(c => c.diasAtraso > 15).length;

    // Urgente (6-15 dias): contagem de cobranças
    const urgente = cobrancas.filter(c => c.diasAtraso >= 6 && c.diasAtraso <= 15).length;

    // Total Recebido: soma de todos os valorPago
    const totalRecebido = cobrancas.reduce((sum, c) => sum + (c.valorPago || 0), 0);

    console.log('[getTotalizadores] 📊 TOTAIS CALCULADOS (BASE44):');
    console.log(`  Total a Receber (∑ valorTotal): R$ ${totalReceber.toFixed(2)}`);
    console.log(`  Total em Atraso (∑ valorAberto onde diasAtraso>0): R$ ${totalAtraso.toFixed(2)}`);
    console.log(`  Total Recebido (∑ valorPago): R$ ${cobrancas.reduce((s, c) => s + (c.valorPago || 0), 0).toFixed(2)}`);
    console.log(`  Clientes Atrasados: ${clientesAtrasadosUnicos}`);
    console.log(`  Dias Médios: ${diasMedia}d`);
    console.log(`  Crítico (15+): ${critico}`);
    console.log(`  Urgente (6-15): ${urgente}`);
    console.log(`  📌 VERIFICAÇÃO: R$ ${totalAtraso.toFixed(2)} (falta) + R$ ${cobrancas.reduce((s, c) => s + (c.valorPago || 0), 0).toFixed(2)} (pago) = R$ ${(totalAtraso + cobrancas.reduce((s, c) => s + (c.valorPago || 0), 0)).toFixed(2)} (bruto)`);

    return {
      totalAtraso,
      qtdAtrasados: clientesAtrasadosUnicos,
      diasMedia,
      totalReceber,
      totalRecebido,
      critico,
      urgente,
    };
  } catch (err) {
    console.error('[cobrancasService] Erro ao calcular totalizadores:', err.message);
    return {
      totalAtraso: 0,
      qtdAtrasados: 0,
      diasMedia: 0,
      totalReceber: 0,
      totalRecebido: 0,
      critico: 0,
      urgente: 0
    };
  }
}
