# SAIPOS — Autorizar notas fiscais

Extensão local para Chrome e Brave que processa as notas com status **Não enviado** na tela **Cupons Gerados**.

## O que ela faz

- abre cada nota ainda não enviada;
- gera o documento fiscal quando o botão **Gerar Documento Fiscal** estiver disponível;
- mantém o CPF/CNPJ exatamente como o SAIPOS carregou;
- marca **Atualizar a data de emissão para a data atual**;
- mantém desmarcada a opção de informação complementar;
- reconhece documentos amarelos, abre **Cupons dessa venda** e usa **Enviar Cupom em Contingência**;
- só considera concluída a nota que aparece como autorizada;
- registra e pula qualquer nota que apresente erro, continuando nas demais;
- permite interromper o processamento pelo botão **Parar**.

## Instalação no Brave

1. Abra `brave://extensions`.
2. Ative **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação**.
4. Selecione a pasta `saipos-notas-fiscais-extension`.

No Chrome, use `chrome://extensions` e siga os mesmos passos.

## Uso

1. Abra o SAIPOS e entre no relatório **Cupons Gerados**.
2. Escolha o período e deixe o status das notas como **Não enviados**.
3. Clique em **Buscar**.
4. Clique no ícone da extensão para abrir o painel **Notas fiscais**.
5. Clique em **Iniciar** e confirme.
6. Mantenha a aba aberta enquanto o processamento estiver em andamento.

Clique novamente no ícone da extensão para ocultar o painel. O processamento continua normalmente enquanto ele estiver oculto.

As notas puladas ficam registradas em vermelho no painel. Para tentar novamente depois de corrigir o problema no SAIPOS, recarregue a página e inicie a extensão outra vez.

### Atualização 1.1.0

- corrige a falsa mensagem **Tempo de espera excedido** que podia aparecer depois de o SAIPOS já ter autorizado um cupom em contingência;
- aguarda a tabela ser recarregada antes de concluir que não há outras notas;
- evita abrir novamente um cupom já tratado enquanto a listagem ainda estiver desatualizada;
- ao clicar novamente em **Iniciar**, tenta outra vez somente as notas que continuam como **Não enviado**.
- mantém o painel oculto até você clicar no ícone da extensão; outro clique oculta o painel novamente.

## Observações

- A extensão funciona apenas em `https://conta.saipos.com/`.
- Ela não altera itens, valores, clientes, pagamentos ou observações da venda.
- Como depende da interface atual do SAIPOS, uma mudança futura no site pode exigir uma atualização da extensão.
