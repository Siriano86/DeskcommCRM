# Módulo Instagram Omnichannel (Direct & Comment-to-DM)

> **Padrão de Engenharia Modular para o DeskcommCRM**  
> Este módulo implementa atendimento no Instagram Direct (mensagens 1:1) e captura de leads por comentários em postagens/Reels (Comment-to-DM), projetado de forma desacoplada para garantir total compatibilidade com atualizações do Git (`update.sh`).

---

## 1. Visão Geral dos Recursos

1. **Atendimento Unificado no Direct (1:1 Messaging):**
   * Conversas do Instagram Direct aparecem diretamente no Inbox unificado ao lado do WhatsApp.
   * Identificação visual instantânea via `<CanalBadge />` com as cores e logo oficiais do Instagram.
   * Suporte para respostas de atendentes humanos e condução automática por agentes de IA.

2. **Captura Automatizada de Comentários (Comment-to-DM):**
   * Monitoramento de comentários em publicações e Reels específicos da conta comercial do Instagram.
   * Filtro flexível por palavras-chave (ex: `"QUERO"`, `"PREÇO"`, `"INFO"`) ou modo aberto.
   * **Proteção Anti-Spam da Meta:** envio de respostas públicas variadas e humanizadas (ex: *"Te enviei no Direct! Dá uma olhada 🚀"*).
   * **Envio Privado Inaugural:** disparo da mensagem no Direct usando o recurso oficial da Meta `recipient.comment_id`, entregando a oferta ao cliente.
   * **Geração Automática de Lead:** criação imediata do card no Kanban na etapa escolhida, com tags e metadados da postagem (`source_metadata`).

3. **Preparado para Planos SaaS & Monetização:**
   * Declaração do identificador de capability `channel:instagram`.
   * Permite controle de acesso por plano (Starter/Pro/Enterprise) em conjunto com o módulo SaaS.

---

## 2. Estrutura de Arquivos

```
modules/instagram/
├── README.md                           <-- Esta documentação técnica
├── types.ts                            <-- Tipos e contratos TypeScript da Graph API
├── comment-engine.ts                   <-- Motor de matching e execução de Comment-to-DM
├── comment-engine.test.ts              <-- Testes unitários com Vitest
└── components/
    └── PostAutomationBuilder.tsx       <-- Formulário de criação/edição de regras de automação

lib/channels/
├── aparencia.ts                        <-- Definição visual (cores e ícones) dos canais
└── adapters/
    └── instagram.ts                    <-- Adapter oficial ChannelAdapter para Graph API

components/channels/
└── CanalBadge.tsx                      <-- Componente visual de badge para o Inbox

app/api/v1/
├── webhooks/instagram/[token]/route.ts <-- Endpoint de Webhook da Meta (GET challenge + POST HMAC)
└── modules/instagram/automations/      <-- API REST para gerenciar regras de Comment-to-DM

supabase/migrations/
└── 20260917130000_0258_modulo_instagram.sql <-- Migration idempotente com RLS
```

---

## 3. Configuração na Meta for Developers

Para conectar uma conta comercial do Instagram ao módulo:
1. Crie um aplicativo do tipo **Business** no [Meta for Developers](https://developers.facebook.com/).
2. Adicione os produtos: **Instagram Graph API** e **Webhooks**.
3. Permissões necessárias:
   * `instagram_basic`
   * `instagram_manage_messages`
   * `instagram_manage_comments`
   * `pages_show_list`
   * `pages_read_engagement`
4. No painel de Webhooks:
   * URL de Retorno: `https://seu-dominio.com/api/v1/webhooks/instagram/<webhook_path_token>`
   * Token de Verificação: configure o mesmo `verify_token` cadastrado em `platform_meta_app`.
   * Campos a assinar: `messages` e `comments`.
