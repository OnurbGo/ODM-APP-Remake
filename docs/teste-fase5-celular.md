# Teste da fase 5 no celular

O aceite da fase 5 (seção 13): um combate com Zumbis, incluindo Horda, do início ao fim, com o mestre no PC e pelo menos um jogador num celular de verdade.

O roteiro automático já faz esse combate inteiro pelo WebSocket: `npm run combate:aceite -- --previa`. Este roteiro é o mesmo combate, à mão, para conferir o que só aparece na tela e na rede de verdade.

## Antes

1. **Firewall:** rode uma vez `npm run firewall:liberar` e aceite a janela do Windows. Sem isso, o celular fica em "Procurando a mesa…".
2. **Pacote:** as regras de combate ainda estão como proposta no lote 8. Até você aprovar, abra a mesa com o pacote da prévia: no PowerShell, `$env:ODM_CONTEUDO="$env:LOCALAPPDATA\ODM-dev\conteudo-previa"; npm run dev`. Depois de aprovar o lote 8 e exportar, basta `npm run dev`.
3. **Celular:** na mesma rede Wi-Fi do PC. Se não entrar, use "Ninguém conseguiu entrar?" no cartão Convidar jogadores e abra a página de teste pelo QR code.

## No combate

| Passo | Onde | O que conferir |
|---|---|---|
| Entrar pelo QR code e criar o personagem | Celular | A mesa abre na aba Combate depois de concluir a ficha |
| Dar uma arma e equipar | Mesa (mestre) e Inventário (celular) | O cartão Atacar mostra a arma, o bônus e o dano |
| Montar o combate com 6 Zumbis e formar a Horda com 5 na iniciativa | Escudo | A Horda aparece com os PV somados e uma carta só |
| Marcar o personagem na área da Horda | Cartão da Horda | Pressão de Massa no início do turno dele |
| Ataque de Horda com o personagem com PA guardado | Escudo e celular | O pop-up de reação abre no celular; a Esquiva mostra o −1 da Ameaça de Massa no registro |
| Atacar um Zumbi pelo celular | Celular | O d20 rola com "Defesa ?"; o registro do jogador não mostra Defesa nem PV |
| Dano em área na Horda (fogo, 3 espaços) | Escudo | Sai um integrante a cada 10 de dano; com 2 ou menos, ela se desfaz |
| Pedir um teste de resistência com DT oculta | Escudo | O pop-up do celular mostra "DT ?" e não fecha sem resposta |
| Derrubar o personagem a 0 PV | Escudo | Morrendo no celular; no turno dele, "Fazer o Teste de Morte" |
| Curar 1 PV | Escudo | O Morrendo acaba |
| Atitude Imprudente no turno | Celular | Uma vez por turno; a falha pendente aparece |
| Encerrar o combate e dar um descanso curto | Escudo | PV pela Fibra no registro |
| Desfazer qualquer linha do registro | Escudo | O estado volta, em qualquer ordem |

## Resultado em 07/11/2026

Samsung SM-M625F (Android, Chrome) ligado pelo cabo USB, com `adb reverse tcp:5173 tcp:5173`: o `localhost` do celular vai ao PC pelo cabo, sem passar pela rede, então o bloqueio do firewall não atrapalha. Mestre no PC, com o pacote da prévia.

Passou: entrada pelo código; personagem entregue pelo mestre; compra da carta de iniciativa no celular; Horda de 5 com Ataque de Horda e Pressão de Massa; ataque do celular com a animação 3D e "Defesa ?"; Atitude Imprudente; pop-up de reação com Esquiva (−1 da Ameaça de Massa); resistência automática e, desligada, o pop-up com "DT ?"; Morrendo com Teste de Morte no celular até as três falhas e a tabela de consequência; Exaustão 4 cortando PV, Defesa e deslocamento; cura que encerra o Morrendo; Horda destruída; fim do combate; descanso curto e o desfazer dele. A mesa voltou igual depois de o servidor reiniciar no meio do combate.

Achados:
- **Voltar do Android (corrigido):** com o pop-up de teste aberto, o botão Voltar fechou a aba do Chrome, porque a página não tinha histórico. Ao reabrir o endereço, o celular voltou direto ao personagem e ao teste pendente, sem pedir entrada. Agora o Voltar fecha a camada de cima (pop-up, folha da iniciativa, rolagem do d20) e não faz nada no pop-up obrigatório. No Chrome isso usa o CloseWatcher, porque o Chrome pula as entradas de histórico criadas sem toque do usuário; conferido no celular.
- **Faixa do turno no celular (corrigido):** o botão "Carta" quebrava em duas linhas ("CART / A") nesta largura.
- **PA guardado de quem está inconsciente (decidido e corrigido):** o PA do turno virava "guardado" mesmo Morrendo, e a cura na mesma rodada deixaria reagir com ele. Decisão de 07/11/2026: quem começa o turno Inconsciente perde todos os PA daquele turno (especificação 14).

## Se algo der errado

Anote o passo, o que apareceu e a hora do registro. O registro da sessão fica salvo na campanha, então dá para conferir depois.
