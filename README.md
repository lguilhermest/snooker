# Chave de Sinuca

Gerador de chaveamento de **dupla eliminatória** para torneios de sinuca. Site estático, sem build e sem dependências: funciona no GitHub Pages e também abrindo o `index.html` direto no navegador.

## O que faz

- Qualquer número de jogadores de 2 a 64. Quando a chave não fecha, os jogos de W.O. são criados e resolvidos automaticamente, nas duas chaves
- Sorteio geral, cabeças de chave ou ordem da lista
- Chave dos vencedores, repescagem e final, com segunda final opcional se o invicto perder
- Melhor de N diferente para vencedores, repescagem e final
- Placar parcial, W.O. e correção de resultado (só cai o que dependia dele)
- Controle de mesas e fila de próximos jogos
- Classificação completa, impressão em A4 e link de compartilhamento

Os dados ficam no navegador (`localStorage`). O link compartilhado é uma foto do momento e não se atualiza sozinho.

## Publicar no GitHub Pages

1. Envie o projeto para um repositório no GitHub.
2. Em **Settings → Pages**, escolha **Deploy from a branch**, branch `main`, pasta `/ (root)`.
3. O site fica em `https://<usuario>.github.io/<repositorio>/`.

## Testes

```sh
node --test tests/*.test.js
```

`js/bracket.js` tem a lógica (sem DOM) e `js/app.js` a interface.
