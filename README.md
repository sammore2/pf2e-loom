<p align="center">
  <img src="./assets/images/cover.webp" alt="Pathfinder 2nd Edition Remaster on LoomVTT" width="100%" style="border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,0.6);" />
</p>

# Pathfinder 2nd Edition (Remaster) — Ruleset for LoomVTT

[![Loom VTT](https://img.shields.io/badge/Loom%20VTT-2.0.5--alpha-blueviolet)](https://loomvtt.com)
[![Version](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fsammore2%2Fpf2e-loom%2Fmain%2Fruleset.json&query=%24.version&label=version&color=c99738)](https://github.com/sammore2/pf2e-loom/releases)
[![License](https://img.shields.io/badge/license-MIT%20AND%20ORC%20AND%20Paizo--Community--Use-blue)](LICENSE)
[![Downloads](https://img.shields.io/github/downloads/sammore2/pf2e-loom/latest/pf2e.zip?label=downloads)](https://github.com/sammore2/pf2e-loom/releases/latest)

<p align="center">
  <strong>A tactical, faithful, high-performance ruleset for Pathfinder 2nd Edition (Remaster) on LoomVTT.</strong><br>
  <em>Fully integrated with official rules under the ORC License and the Paizo Community Use Policy.</em>
</p>

---

## ⚔️ About the System

**PF2E Remaster** for **LoomVTT** is a complete, faithful implementation of the rules of *Pathfinder 2nd Edition (Remaster)* published by Paizo. Built for maximum fluidity at the virtual table, it combines smart tactical automation, themed visual design and the mechanical depth that makes Pathfinder 2e one of the most acclaimed RPGs in the world.

The ruleset runs directly on the LoomVTT architecture, providing instant calculations, real-time communication between GMs and players over WebSockets, and strict compliance with the open **ORC** license.

---

## 🌟 Key Features

### 🎯 1. Canonical Rules Engine (Remaster)
- **Strict Bonus Stacking**: Only the highest bonus and the worst penalty per category (*status*, *circumstance* and *item*) are applied, and untyped bonuses are added up, as in the official rules.
- **Four Degrees of Success**: Automatic evaluation against the target DC — *Critical Failure*, *Failure*, *Success* and *Critical Success* — with dynamic adjustment on a natural 20 (+1 degree) or natural 1 (-1 degree).
- **Fortune and Misfortune Rolls**: Native support for *Fortune* and *Misfortune* rolls.

### ⚔️ 2. Tactical Combat and Action Resolution
- **Strikes with Automatic MAP**: The attack ladder is calculated in real time with the multiple attack penalty (*0 / -5 / -10* for regular weapons and *0 / -4 / -8* for agile weapons).
- **Interactive Attack and Damage Cards**: Hits in chat offer a damage roll button (and automatic critical damage on critical successes).
- **Basic Saving Throws for Spells**: Cards with saving throw options that apply automatic damage using the canonical multipliers (*Critical Failure: 2x*, *Failure: 1x*, *Success: ½*, *Critical Success: 0x*).
- **Damage and Healing Applied to Tokens**: Detects the targeted tokens on the canvas, syncs with the combat tracker and applies mitigated damage or HP recovery directly to the target.
- **Mitigation and Shield Block**: Support for weaknesses, resistances, immunities and shield Hardness absorption, with HP tracking and the Broken Threshold.
- **Survival and Death Cycle**: Automated track for *Dying*, *Wounded* and *Doomed*, with *Recovery Flat Checks*.

### 🎒 3. Inventory, Bulk and Consumables
- **Canonical Bulk Calculation**: Based on Strength (`5 + Strength modifier` to become encumbered, `10 + modifier` for the maximum capacity), automatically grouping 10 light (L) items into 1 Bulk.
- **Item Consumption, Charges and Uses**: A dedicated consume button in the inventory for potions, elixirs, scrolls and wands. It decrements charges/uses or stacks and rolls the healing formula (for example *Healing Potion* or *Elixir of Life*), applying the HP gain to the sheet.

### 📜 4. Diegetic Play Sheets
- **Character Sheet (`Pf2eCharacterSheet`)**: A tactical layout with a side attribute rail, tactile hit point pips, U/T/E/M/L proficiencies, Hero Points, Focus Points and an actions console.
- **Party Sheet (`Pf2ePartySheet`)**: A consolidated view for the GM to monitor the team's HP, AC, passive Perception, saves, exploration activities and shared treasure.
- **NPC and Monster Sheet (`Pf2eNpcSheet`)**: A compact interface for fast combat with immediate rolls for attacks, spells, skills and monster traits.
- **Specialized Sheets**: Native support for *Hazards* (`Pf2eHazardSheet`), *Familiars* (`Pf2eFamiliarSheet`) and *Vehicles* (`Pf2eVehicleSheet`).

### 🧙 5. Character Creation and Spells
- **7-Step Creation Assistant**: Guides the player through choosing Ancestry, Heritage, Background, Class, Ability Scores (direct +1 per Remaster boost), Skills and starting Feats.
- **Level Up**: Automatic HP increase, consumption of 1000 XP, and calculation of boosts and feats per class.
- **Spells and Heightening**: Dynamic scaling by interval or fixed ranks, with automatic consumption of spell slots or Focus Points.

### 🎲 6. GM Tools and Downtime
- **Encounter Calculator and Treasure Budget**: Threat estimates (*Trivial*, *Low*, *Moderate*, *Severe*, *Extreme*) and a coin budget according to the official GM Core tables.
- **Downtime Activities**: *Crafting* with cost reduction and *Earn Income*, calculated by task level and skill proficiency.
- **Compendium Browser**: Search and filtering across more than 90 compendiums, with Drag & Drop support.

### 🌐 7. Full Bilingual Support
- 🇧🇷 **Brazilian Portuguese (`pt-BR`)**: Official Remaster translation and terminology.
- 🇺🇸 **English (`en`)**: Strict parity of names, traits and terms with the Paizo books.

---

## 📥 Installation

### From the LoomVTT Marketplace
1. In your world's main menu in LoomVTT, go to **Settings > Modules & Rulesets**.
2. Search for **PF2E** in the Marketplace tab.
3. Click **Install** and enable the ruleset in the world preferences.

### Installing via Manifest (Direct URL)
In LoomVTT's ruleset installation panel, enter the official manifest link:

```text
https://github.com/sammore2/pf2e-loom/releases/latest/download/ruleset.json
```

---

## 🛠️ Developer Guide

### Project Structure

```text
pf2e/
├── assets/             # Cover art, SVG icons, logos and fonts
├── lang/               # Localization dictionaries (pt-BR.json, en.json)
├── packs/              # Base compendiums in JSON (actions, equipment, spells, feats)
├── packs-orc/          # SQLite compendiums with data under the ORC license
├── scripts/            # Game logic, sheets and integration modules
│   ├── character-builder.mjs        # Character creation and level-up logic
│   ├── character-builder-dialog.mjs # Creation assistant dialog
│   ├── character-sheet.mjs          # Tactical character sheet
│   ├── chat-card.mjs                # Chat cards, target resolution and saving throws
│   ├── compendium-browser.mjs       # ORC compendium browser
│   ├── conditions.mjs               # Condition catalog and decay
│   ├── damage.mjs                   # Damage, healing, mitigation, shields and consumables
│   ├── downtime.mjs                 # Earn Income and Crafting
│   ├── encounter.mjs                # Encounter and treasure calculator
│   ├── formula.mjs                  # Safe dice formula evaluator
│   ├── gm-tools-sheet.mjs           # GM tools panel
│   ├── modifiers.mjs                # Canonical bonus stacking rules
│   ├── npc-sheet.mjs                # Tactical monster and NPC sheet
│   ├── persistent-damage.mjs        # Persistent damage and end-of-turn checks
│   ├── prepare-data.mjs             # Statistics and Bulk preparation pipeline
│   ├── progression-tables.mjs       # Class and level progression tables
│   ├── roll-engine.mjs              # Unified d20 and damage roll engine
│   ├── rule-elements.mjs            # Modifier system and dynamic rules
│   └── spellcasting.mjs             # Slot, focus and heightening management
├── styles/             # Themed stylesheets (pf2e.css)
├── templates/          # Handlebars (.hbs) templates for sheets and windows
├── tests/              # Full suite of 161 automated tests (Node test runner)
├── tools/              # Build helpers and compendium audit tools
├── pf2e.mjs            # Ruleset entry point in LoomVTT
└── ruleset.json        # Package manifest
```

### Automated Tests

The system has **161 unit tests** with no heavy external dependencies, running in a few milliseconds on native Node.js:

```bash
# Run the test suite
npm test

# Check script integrity and syntax
npm run check
```

---

## ⚖️ Licenses and Intellectual Property

- **Source code and software implementation**: Licensed under the [MIT](LICENSE) license.
- **Game mechanics and content**: Licensed under the **ORC License** (Library of Congress TX 9-307-067). See [`ORC-NOTICE.md`](ORC-NOTICE.md) for attribution details.
- **Pathfinder names, marks and logos**: Used under the **Paizo Community Use Policy**. See [`PAIZO-COMMUNITY-USE.md`](PAIZO-COMMUNITY-USE.md) for the full statement.
- **Paizo Inc. legal notice**: *Pathfinder* is a registered trademark of Paizo Inc. This product is not published, endorsed, or specifically approved by Paizo Inc. Charging for use of or access to this content is expressly prohibited.

<details>
<summary>Português (pt-BR)</summary>

<p align="center">
  <strong>Ruleset tático, autêntico e de alta performance para Pathfinder 2ª Edição (Remaster) no LoomVTT.</strong><br>
  <em>Totalmente integrado com regras oficiais sob a ORC License e a Paizo Community Use Policy.</em>
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

</details>
