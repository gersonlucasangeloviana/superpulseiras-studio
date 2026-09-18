# SuperPulseiras Studio

Studio de criação de pulseiras para equipe interna: Next.js + TypeScript, API Python/FastAPI e PostgreSQL. Converse por texto, envie uma referência e refine a arte na mesma conversa. O assistente pode pedir informações antes de produzir uma imagem.

## O que está implementado

- Login com senha da equipe e cookie de sessão HttpOnly, com expiração em 7 dias.
- Conversas persistentes, busca por título, renomeação e exclusão com confirmação.
- Texto e imagem como entrada; texto, imagem ou ambos como resposta.
- Referências em PNG, JPG ou WebP: upload, arrastar e soltar ou colar; até 10 MB / 20 megapixels.
- Simulação da pulseira e arte plana selecionáveis em cada mensagem.
- Prompt global e qualidade configuráveis, com cópia das configurações usadas em cada resposta.
- Download PNG, visualização ampliada, acompanhamento da resposta e repetição após falha.
- Proteção contra envios duplicados e duas chamadas simultâneas à OpenAI no máximo por instância.
- Migrações SQL versionadas, volumes persistentes e health checks.

As conversas e configurações são compartilhadas entre os integrantes da equipe. Esta versão usa uma senha comum, sem contas individuais ou permissões por usuário.

## Publicar na VPS com Dokploy

1. Coloque este projeto em um repositório acessível pelo Dokploy.
2. Crie um projeto e um serviço **Docker Compose**, vincule o repositório e selecione `docker-compose.yml` como arquivo de Compose. Use Docker Compose, não Docker Stack.
3. No painel de variáveis do serviço, copie as chaves de `.env.example` e preencha os valores reais. Gere senhas distintas para PostgreSQL e equipe; a senha da equipe deve ter pelo menos 12 caracteres e `SESSION_SECRET` pelo menos 32. Não use os exemplos em produção.
4. Configure `OPENAI_API_KEY`, `APP_ORIGIN=https://studio.seudominio.com.br` (sem caminho) e `COOKIE_SECURE=true`. Os modelos são configuráveis conforme o acesso da sua conta.
5. Faça o deploy. A API aplica as migrações pendentes automaticamente depois que o PostgreSQL estiver saudável.
6. Em **Domains**, associe seu domínio ao serviço **frontend**, porta **3000**, caminho `/`, com HTTPS/Let's Encrypt. Configure o registro DNS para a VPS. Use a gestão de domínios/isolamento do Dokploy para conectar o frontend ao Traefik.
7. Abra o domínio, entre com a senha da equipe e ajuste o prompt em **Configurações do assistente**.

Somente o frontend recebe domínio público. PostgreSQL e backend ficam na rede interna do Compose; não publique suas portas. O frontend encaminha `/api/*` ao backend, inclusive cookies, arquivos e downloads. A chave OpenAI nunca é enviada ao navegador ou incorporada ao build.

O `BACKEND_URL` das rewrites é definido no build do frontend. Se mudar o endereço interno do backend, altere o argumento de build e reconstrua a imagem.

### Persistência e operação

- `postgres_data`: histórico, configurações, status e metadados.
- `studio_images`: imagens enviadas e geradas, em `/app/data/images`.
- Faça backup dos **dois volumes**. O dump do banco sozinho não inclui os arquivos de imagem. Use `pg_dump`/`pg_restore` para o banco e um backup do volume de imagens, idealmente com a aplicação parada para manter a consistência.
- Redeploy normal preserva os volumes. Não execute `docker compose down -v` em produção.
- Execute **uma réplica do backend com um worker**, conforme o Dockerfile. As chamadas rodam em tarefas assíncronas no processo; os estados ficam no banco. Em reinício, respostas interrompidas são marcadas como falha, sem cobrança automática por uma nova tentativa. Uma chamada interrompida pode ter sido cobrada pelo provedor.
- Para várias réplicas/workers, a próxima evolução é separar execução em uma fila durável com worker dedicado e armazenamento compartilhado de imagens. Não escale horizontalmente esta versão sem essa alteração.
- Alterar `STUDIO_PASSWORD` ou `SESSION_SECRET` invalida as sessões existentes. O login limita tentativas incorretas globalmente por processo.

## Executar localmente com Docker

Copie `.env.example` para `.env` e preencha as senhas. A chave OpenAI é necessária para conversar/gerar; a interface e configurações podem ser usadas sem ela.

```sh
docker compose -f docker-compose.yml -f compose.local.yaml up --build -d
```

Abra http://localhost:3000. O override local publica somente o frontend em loopback e desativa cookie Secure para HTTP. Para parar, use o mesmo comando de Compose com `stop`.

## Desenvolvimento sem Docker

Requisitos: Node.js 22, Python 3.12+ e um PostgreSQL com banco dedicado.

```sh
python -m venv .venv
# Windows:
.venv\Scripts\python -m pip install -r backend/requirements.lock.txt
```

Copie `backend/.env.example` para `backend/.env`, configure `DATABASE_URL`, as credenciais da equipe e a chave OpenAI. No desenvolvimento local, mantenha `APP_ORIGIN=http://localhost:3000` e `COOKIE_SECURE=false`.

```sh
.venv\Scripts\python -m uvicorn app:app --app-dir backend --host 127.0.0.1 --port 8000
```

Em outro terminal:

```sh
cd frontend
npm ci
npm run dev
```

## Validação

```sh
cd frontend
npm run build
npm run typecheck
```

Os testes unitários não chamam a OpenAI. Os testes de integração exigem um PostgreSQL **exclusivo para testes**, pois recriam o schema `public` desse banco.

```sh
.venv\Scripts\python -m pytest backend/tests -q
# Para habilitar os testes de integração, defina TEST_DATABASE_URL apontando ao banco descartável.
```

O banco de testes deve ter nome terminado em `_test`. O workflow em `.github/workflows/ci.yml` inicia PostgreSQL e executa os testes de integração no GitHub Actions.

Para verificar a interface, com o frontend em execução e Google Chrome instalado, execute `npm run test:ui` em `frontend`. Esse teste usa uma API simulada, verifica o fluxo de texto/imagem e salva capturas em `frontend/test-results`. Ele não valida a conexão real com OpenAI ou PostgreSQL. Para usar outro navegador instalado compatível com Playwright, defina `PLAYWRIGHT_CHANNEL`.

Validação realizada neste ambiente: build de produção e TypeScript aprovados; 15 testes unitários aprovados; fluxo de navegador aprovado; Compose de produção e local com sintaxe validada. Os 4 testes PostgreSQL ficaram pendentes por falta de banco de testes em execução. As imagens Docker ainda precisam de build/execução no Dokploy ou em um Docker ativo. A chamada real à OpenAI depende da chave e do acesso aos modelos na conta.

## Como o contexto funciona

A API usa a Responses API com a ferramenta `image_generation` e seleção automática. O modelo pode fazer perguntas em texto ou gerar imagens. Cada novo pedido inclui os textos anteriores e até as quatro imagens mais recentes; o histórico completo permanece salvo e visível. O limite inicial é de 30 mensagens do usuário por conversa, para limitar o crescimento do contexto. Abra outra conversa com a referência desejada para continuar.

As respostas usam `store=false`; a continuidade é reconstruída a partir do banco e dos arquivos locais, sem depender de IDs de respostas remotas. Isso não altera as demais políticas de retenção da conta OpenAI.

Arte plana é um **conceito raster em PNG (1536 × 1024)**, não um PDF vetorial com medidas, sangria e perfil CMYK. Confira grafia, logotipos e detalhes antes de finalizar para impressão.

## Referências oficiais

- [OpenAI: geração de imagens e conversas](https://developers.openai.com/api/docs/guides/image-generation)
- [Dokploy: domínios para Docker Compose](https://docs.dokploy.com/docs/core/docker-compose/domains)
