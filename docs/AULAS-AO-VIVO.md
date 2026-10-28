# Aulas ao vivo

O professor compartilha uma tela, janela ou aba com os alunos matriculados na turma. O modo escolhido para vídeos é compartilhar a aba do navegador, com áudio. A transmissão usa WebRTC por um servidor LiveKit próprio; a apresentação é enviada uma vez pelo professor e distribuída aos espectadores. Não grava nem importa arquivos de vídeo.

## Uso

1. Abra a turma e use **Aula ao vivo → Compartilhar tela ou vídeo** em um computador com Chrome ou Edge.
2. Para mostrar vídeo, abra-o em outra aba, escolha **Aba do navegador**, selecione o vídeo e marque **Compartilhar áudio da aba**. O navegador sempre pede que o professor escolha o conteúdo.
3. Confirme e dê play no vídeo. A prévia informa se a aba incluiu áudio. O microfone é opcional, desligado inicialmente, e só é solicitado ao selecionar **Ligar microfone**.
4. O aluno usa **Aula ao vivo** no início do sistema e seleciona **Assistir ao vivo**. Pode assistir pelo celular, ativar/silenciar som, abrir em tela cheia ou sair.
5. **Encerrar transmissão**, parar o compartilhamento pelo navegador ou sair da página do professor encerra a sala. A aplicação não confirma permissões automaticamente: o usuário decide na janela do navegador.

O professor pode compartilhar a tela inteira ou uma janela; a disponibilidade de áudio depende do navegador e da origem escolhida. O fluxo orientado e testado para vídeo é compartilhar uma aba. Navegadores móveis que não oferecem `getDisplayMedia` não podem iniciar compartilhamento; continuam podendo assistir.

## Acesso e ciclo da sala

As rotas verificam sessão ativa, troca inicial de senha, instituição, turma e matrícula/professor responsável. Só gestores autorizados iniciam/encerram; alunos recebem JWT de cinco minutos restrito à sala e sem permissão para publicar mídia/dados ou administrar salas. A assinatura fica no servidor. Não se usam links públicos de convite.

A tabela `LiveSession` guarda sala, professor e horários, com chaves estrangeiras/indexes e índice único parcial para uma sala ativa por turma. A criação usa trava transacional por turma. Estado é consultado a cada cinco segundos na sala e dez segundos no cartão do início; mídia é contínua, não depende desse intervalo. O professor envia heartbeat a cada 15 segundos. Salas sem heartbeat por 90 segundos são encerradas ao consultar.

Webhooks assinados encerram a sala ao sair o apresentador e sincronizam a finalização do servidor. Sem cookies nem Origin nesses callbacks: a autenticação é a assinatura LiveKit sobre o corpo original. `room.auto_create=false` impede recriar salas encerradas apenas reaproveitando tokens. Encerramento também para todas as trilhas locais; o aluno não solicita câmera/microfone. Não há gravação automática ou serviço Egress.

## VPS

- LiveKit Server 1.13.11, binário oficial conferido por SHA-256, serviço `aprender-livekit` com usuário próprio e início automático.
- App e serviço compartilham credenciais aleatórias privadas em `/etc/aprender.env` e `/etc/aprender-livekit.yaml`.
- `LIVEKIT_API_URL=http://127.0.0.1:7880`; URL do cliente `wss://191.252.155.205/livekit`, com o certificado HTTPS do IP.
- Nginx encaminha `/livekit/` para o serviço com Upgrade/WebSocket. Access logs são desativados nessa localização para não registrar tokens da URL; error log apenas crítico.
- UFW libera ICE/TCP 7881, ICE/UDP 7882 e TURN/UDP 443. API 7880 não é liberada publicamente.
- TURN usa autenticação integrada; a conexão por relay UDP/443 foi validada forçando `iceTransportPolicy=relay` no navegador de teste. Não foi configurado TURN/TLS sobre TCP/443. Redes que bloqueiam UDP e permitem apenas HTTPS/TCP 443 podem exigir uma configuração adicional de TURN/TLS.
- Buffers UDP configurados em `/etc/sysctl.d/90-aprender-live.conf`. Limite de 512 MB do serviço e até 64 conexões por sala; o limite técnico não é uma garantia de capacidade em todas as redes. Observe CPU/banda antes de ampliar turmas simultâneas.

`deploy/install-livekit.sh` instala a infraestrutura desta VPS. `deploy/update-live-classroom.sh` faz backup, instala dependências, aplica migrações, compila e troca o release apenas após o build. Não execute o instalador da VPS em máquinas de desenvolvimento: ele contém IP e caminhos dessa implantação. Backup PostgreSQL diário inclui os metadados das novas sessões.

## Ambiente local Windows

Use o PostgreSQL do Compose e `scripts/start-livekit-local.ps1`, que baixa o binário Windows 1.13.11, verifica SHA-256 e inicia sem janela. Arquivos baixados ficam em `.deployment/livekit`, fora do versionamento. `deploy/livekit-local.yaml` e `.env.example` usam credenciais conhecidas apenas para desenvolvimento, com sinalização em loopback. A aplicação neste ambiente usa `http://localhost:3001` e o webhook local aponta a essa porta. Não reutilize essas credenciais em produção.

O servidor nativo Windows foi escolhido porque o encaminhamento ICE pelo Docker Desktop não estabeleceu a mídia nos testes. O binário nativo funcionou; seu aviso de monitoramento de CPU indisponível no Windows não impede os testes de mídia. O servidor Linux da VPS utiliza o monitoramento normal. A configuração local serve para o próprio computador; alunos remotos devem usar o HTTPS público.

## Validação

28 testes locais de integração/navegador passaram, incluindo duas sessões de aluno recebendo simultaneamente, contadores de quadros/bytes RTP, som da aba e microfone, permissões, origem, assinatura falsa, concorrência de início, encerramento e parada nativa do compartilhamento. Apostilas, avaliações e funcionalidades existentes também passaram.

No endereço público foram validados os acessos pela turma e pelo início do aluno, dois espectadores, áudio/vídeo via TURN forçado, microfone, layout móvel, token de aluno sem publicação, parada de todas as trilhas, encerramento dos dois espectadores e fechamento da sala pelo webhook ao sair da página. As fontes foram um canvas animado e áudio sintético inseridos **somente no navegador do teste**; o transporte WebRTC/servidor foi real. Não houve transmissão de uma tela física nem automação da janela de escolha do sistema operacional. A instituição e as credenciais temporárias foram removidas após o teste.

Referências: [compartilhamento LiveKit](https://docs.livekit.io/transport/media/screenshare/), [portas e firewall](https://docs.livekit.io/transport/self-hosting/ports-firewall/), [Screen Capture](https://www.w3.org/TR/screen-capture/) e [instalação LiveKit](https://docs.livekit.io/transport/self-hosting/deployment/).
