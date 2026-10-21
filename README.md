<p align="center">
  <img src="./assets/images/cover.webp" alt="Pathfinder 2ª Edição Remaster no LoomVTT" width="100%" style="border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,0.6);" />
</p>

# Pathfinder 2ª Edição (Remaster) — Ruleset para LoomVTT

<p align="center">
  <strong>Ruleset tático, autêntico e de alta performance para Pathfinder 2ª Edição (Remaster) no LoomVTT.</strong><br>
  <em>Totalmente integrado com regras oficiais sob a ORC License e a Paizo Community Use Policy.</em>
</p>

<p align="center">
  <a href="https://github.com/sammore2/pf2e-loom/releases"><img src="https://img.shields.io/badge/versão-v0.1.0-c99738?style=flat-square" alt="Ruleset Version" /></a>
  <a href="https://github.com/sammore2/pf2e-loom"><img src="https://img.shields.io/badge/engine-LoomVTT%20%3E%3D0.1.0-781822?style=flat-square" alt="Loom Engine" /></a>
  <a href="https://github.com/sammore2/pf2e-loom"><img src="https://img.shields.io/badge/testes-161%20passando-2ea44f?style=flat-square" alt="Tests Status" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/licença-MIT%20%7C%20ORC%20%7C%20CUP-blue?style=flat-square" alt="License" /></a>
  <a href="lang/"><img src="https://img.shields.io/badge/idiomas-PT--BR%20%7C%20EN-purple?style=flat-square" alt="Languages" /></a>
</p>

---

## ⚔️ Sobre o Sistema

O **PF2E Remaster** para **LoomVTT** é uma implementação completa, pura e fiel às regras de *Pathfinder 2ª Edição (Remaster)* publicada pela Paizo. Desenvolvido para oferecer fluidez máxima na mesa virtual, ele combina automação tática inteligente, design visual temático e a profundidade mecânica que torna o Pathfinder 2e um dos RPGs mais consagrados do mundo.

O ruleset opera diretamente sobre a arquitetura do LoomVTT, garantindo cálculos instantâneos, comunicação em tempo real via WebSockets entre Mestres e jogadores, e conformidade rigorosa com a licença aberta **ORC**.

---

## 🌟 Recursos Principais

### 🎯 1. Motor de Regras Canônico (Remaster)
- **Empilhamento Rigoroso de Bônus**: Consolida estritamente apenas o maior bônus e a pior penalidade por categoria (*status*, *circunstância* e *item*), somando bônus não-tipados conforme as regras oficiais.
- **Quatro Graus de Sucesso**: Avaliação automática contra a Classe de Dificuldade (CD) alvo — *Falha Crítica*, *Falha*, *Sucesso* e *Sucesso Crítico* —, com ajuste dinâmico ao rolar 20 natural (+1 grau) ou 1 natural (-1 grau).
- **Rolar com Fortuna e Revés**: Suporte nativo a rolagens de *Fortune* e *Misfortune*.

### ⚔️ 2. Combate Tático e Resolução de Ações
- **Strikes com MAP Automático**: Escada de ataque calculada em tempo real com penalidade de ataque múltiplo (*0 / -5 / -10* para armas comuns e *0 / -4 / -8* para armas ágeis).
- **Cartões Interativos de Ataque e Dano**: Acertos no chat oferecem o botão de rolagem de dano (e dano crítico automático em sucessos críticos).
- **Salvaguardas Básicas de Magia**: Cartões com opções de salvaguarda que aplicam dano automático com multiplicadores canônicos (*Falha Crítica: 2x*, *Falha: 1x*, *Sucesso: ½*, *Sucesso Crítico: 0x*).
- **Aplicação de Dano & Cura nos Tokens**: Detecta tokens alvos selecionados no canvas, sincroniza com o combat tracker e aplica dano mitigado ou recuperação de PV diretamente no alvo.
- **Mitigação & Bloqueio com Escudo (Shield Block)**: Suporte a fraquezas, resistências, imunidades e absorção por Dureza (*Hardness*) de escudo com controle de PV e Limiar de Quebra (*Broken Threshold*).
- **Ciclo de Sobrevivência & Morte**: Trilha automatizada de *Morrendo (Dying)*, *Ferido (Wounded)* e *Condenado (Doomed)* com testes planos de recuperação (*Recovery Flat Checks*).

### 🎒 3. Inventário, Volume (Bulk) & Consumíveis
- **Cálculo Canônico de Volume (Bulk)**: Baseado em Força (`5 + Modificador de Força` para sobrecarga, `10 + Modificador` para capacidade máxima), agrupando automaticamente 10 itens leves (L) em 1 Volume.
- **Consumo de Itens, Cargas & Usos**: Botão dedicado de consumo no inventário para poções, elixires, pergaminhos e varinhas. Decrementa cargas/usos ou pilhas e rola a fórmula de cura (ex: *Poção de Cura* ou *Elixir da Vida*), aplicando o ganho de vida na ficha.

### 📜 4. Fichas Diegéticas de Jogo
- **Ficha de Personagem (`Pf2eCharacterSheet`)**: Layout tático com rail lateral de atributos, pips táteis de pontos de vida, proficiências U/T/E/M/L, Pontos de Herói, Pontos de Foco e console de ações.
- **Ficha de Grupo (`Pf2ePartySheet`)**: Visão consolidada para o Mestre monitorar PV, CA, Percepção passiva, salvaguardas, atividades de exploração e tesouro compartilhado da equipe.
- **Ficha de NPC & Monstros (`Pf2eNpcSheet`)**: Interface compacta para combate ágil com rolagens imediatas de ataques, magias, perícias e traços de monstros.
- **Fichas Especializadas**: Suporte nativo a *Perigos e Armadilhas* (`Pf2eHazardSheet`), *Familiares* (`Pf2eFamiliarSheet`) e *Veículos* (`Pf2eVehicleSheet`).

### 🧙 5. Criação de Personagens & Magias
- **Assistente de Criação em 7 Passos**: Guia o jogador na escolha de Ancestralidade, Herança, Antecedente, Classe, Atributos (+1 direto por aumento Remaster), Perícias e Talentos iniciais.
- **Evolução de Nível (Level Up)**: Aumento automático de PV, consumo de 1000 XP e cálculo de aumentos e talentos por classe.
- **Magias e Potencialização (Heightening)**: Escalonamento dinâmico por intervalo ou ranks fixos, com consumo automático de espaços de magia ou Pontos de Foco.

### 🎲 6. Ferramentas do Mestre & Downtime
- **Calculadora de Encontros & Orçamento de Tesouro**: Estimativa de ameaça (*Trivial*, *Baixa*, *Moderada*, *Severa*, *Extrema*) e orçamento em moedas segundo as tabelas oficiais do GM Core.
- **Atividades de Tempo Livre (Downtime)**: Manufatura (*Crafting*) com abatimento de custos e Obter Renda (*Earn Income*) calculados por nível de tarefa e graduação de perícia.
- **Navegador de Compêndios (Compendium Browser)**: Busca e filtragem em mais de 90 compêndios com suporte a Arrastar e Soltar (Drag & Drop).

### 🌐 7. Suporte Bilíngue Completo
- 🇧🇷 **Português do Brasil (`pt-BR`)**: Tradução e terminologia oficial do Remaster.
- 🇺🇸 **Inglês (`en`)**: Paridade estrita de nomes, traços e termos com os livros da Paizo.

---

## 📥 Instalação

### Pelo LoomVTT Marketplace
1. No menu principal do seu mundo no LoomVTT, acesse **Configurações > Módulos & Rulesets**.
2. Procure por **PF2E** na aba de Marketplace.
3. Clique em **Instalar** e ative o ruleset nas preferências do mundo.

### Instalação via Manifesto (URL Direta)
No painel de instalação de rulesets do LoomVTT, insira o link oficial do manifesto:

```text
https://github.com/sammore2/pf2e-loom/releases/latest/download/ruleset.json
```

---

## 🛠️ Guia do Desenvolvedor

### Estrutura do Projeto

```text
pf2e/
├── assets/             # Arte de capa, ícones SVG, logotipos e fontes
├── lang/               # Dicionários de localização (pt-BR.json, en.json)
├── packs/              # Compêndios base em JSON (ações, equipamentos, magias, talentos)
├── packs-orc/          # Compêndios SQLite com dados sob a licença ORC
├── scripts/            # Módulos de lógica de jogo, fichas e integração
│   ├── character-builder.mjs        # Lógica de criação e evolução de personagens
│   ├── character-builder-dialog.mjs # Diálogo assistente de criação
│   ├── character-sheet.mjs          # Ficha tática de personagem
│   ├── chat-card.mjs                # Cartões de chat, resolução de alvos e salvaguardas
│   ├── compendium-browser.mjs       # Navegador de compêndios ORC
│   ├── conditions.mjs               # Catálogo e decaimento de condições
│   ├── damage.mjs                   # Dano, cura, mitigação, escudo e consumíveis
│   ├── downtime.mjs                 # Obter Renda e Manufatura
│   ├── encounter.mjs                # Calculadora de encontros e tesouro
│   ├── formula.mjs                  # Avaliador seguro de fórmulas de dados
│   ├── gm-tools-sheet.mjs           # Painel de ferramentas do Mestre
│   ├── modifiers.mjs                # Regras canônicas de empilhamento de bônus
│   ├── npc-sheet.mjs                # Ficha tática de monstros e NPCs
│   ├── persistent-damage.mjs        # Dano persistente e testes de fim de turno
│   ├── prepare-data.mjs             # Pipeline de preparação de estatísticas e Volume
│   ├── progression-tables.mjs       # Tabelas de progressão de classes e níveis
│   ├── roll-engine.mjs              # Motor unificado de rolagens d20 e dano
│   ├── rule-elements.mjs            # Sistema de modificadores e regras dinâmicas
│   └── spellcasting.mjs             # Gestão de slots, foco e potencialização
├── styles/             # Folhas de estilo temáticas (pf2e.css)
├── templates/          # Templates Handlebars (.hbs) das fichas e janelas
├── tests/              # Suíte completa de 161 testes automatizados (Node test runner)
├── tools/              # Ferramentas auxiliares de build e auditoria de compêndios
├── pf2e.mjs            # Ponto de entrada do ruleset no LoomVTT
└── ruleset.json        # Manifesto do pacote
```

### Testes Automatizados

O sistema conta com **161 testes unitários** sem dependências externas pesadas, executados em poucos milissegundos via Node.js nativo:

```bash
# Executar a suíte de testes
npm test

# Verificar integridade e sintaxe dos scripts
npm run check
```

---

## ⚖️ Licenças e Propriedade Intelectual

- **Código-Fonte e Implementação de Software**: Licenciado sob os termos da licença [MIT](LICENSE).
- **Mecânicas e Conteúdo de Jogo**: Licenciados sob a **ORC License** (Library of Congress TX 9-307-067). Consulte [`ORC-NOTICE.md`](ORC-NOTICE.md) para detalhes de atribuição.
- **Nomes, Marcas e Logotipos de Pathfinder**: Utilizados sob a **Paizo Community Use Policy**. Consulte [`PAIZO-COMMUNITY-USE.md`](PAIZO-COMMUNITY-USE.md) para declaração completa.
- **Aviso Legal da Paizo Inc.**: *Pathfinder* é uma marca registrada de Paizo Inc. Este produto não é publicado, endossado ou especificamente aprovado pela Paizo Inc. É expressamente proibido cobrar pelo uso ou acesso a este conteúdo.
