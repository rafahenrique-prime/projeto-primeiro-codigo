import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const telefone = body?.telefone;

    if (!telefone) {
      return Response.json({ error: 'Telefone é obrigatório' }, { status: 400 });
    }

    const telefoneClean = telefone.replace(/\D/g, '');

    // Find client by phone (match in both directions)
    const clientes = await base44.asServiceRole.entities.Cliente.filter({ status: 'ativo' });
    const cliente = clientes.find((c) => {
      const phoneClean = (c.telefone || '').replace(/\D/g, '');
      if (!phoneClean) return false;
      return phoneClean === telefoneClean ||
        phoneClean.endsWith(telefoneClean) ||
        telefoneClean.endsWith(phoneClean);
    });

    if (!cliente) {
      return Response.json({ error: 'Cliente não encontrado. Verifique o telefone informado.' }, { status: 404 });
    }

    // Get ALL parcels for this client (for stats + display)
    const allParcelas = await base44.asServiceRole.entities.Parcela.list('-data_vencimento', 500);
    const parcelas = allParcelas.filter((p) => p.cliente_id === cliente.id);

    // Get sales for this client
    const allVendas = await base44.asServiceRole.entities.Venda.list('-data_venda', 500);
    const vendas = allVendas.filter((v) => v.cliente_id === cliente.id);

    // Get store config
    const configs = await base44.asServiceRole.entities.ConfiguracaoLoja.list();
    const config = configs[0] || null;

    return Response.json({
      cliente: {
        nome: cliente.nome,
        telefone: cliente.telefone,
      },
      parcelas: parcelas.map((p) => ({
        id: p.id,
        numero: p.numero,
        valor_base: p.valor_base,
        valor_pago: p.valor_pago || 0,
        data_vencimento: p.data_vencimento,
        venda_id: p.venda_id,
        forma_pagamento: p.forma_pagamento || null,
      })),
      vendas: vendas.map((v) => ({
        id: v.id,
        data_venda: v.data_venda,
        descricao_itens: v.descricao_itens || '',
        valor_total: v.valor_total,
        numero_parcelas: v.numero_parcelas,
        valor_parcela: v.valor_parcela,
        status: v.status,
      })),
      config: config ? {
        nome_loja: config.nome_loja,
        whatsapp_loja: config.whatsapp_loja,
        chave_pix: config.chave_pix,
        dias_tolerancia: config.dias_tolerancia || 0,
      } : null,
    });
  } catch (error) {
    return Response.json({ error: error.message || 'Erro interno' }, { status: 500 });
  }
});