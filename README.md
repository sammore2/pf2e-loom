# PF2E — Pathfinder 2ª Edição para LoomVTT

<p align="center">
  <img src="assets/images/cover.webp" alt="PF2E Ruleset para LoomVTT" width="700" style="border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.5);" />
</p>

<p align="center">
  <strong>Ruleset tático, autêntico e de alta performance compatível com Pathfinder Segunda Edição (Remaster) no LoomVTT.</strong>
</p>

<p align="center">
  <a href="https://github.com/sammore2/pf2e-loom/releases"><img src="https://img.shields.io/badge/version-v0.1.0-c99738?style=for-the-badge" alt="Ruleset Version" /></a>
  <a href="https://github.com/sammore2/pf2e-loom"><img src="https://img.shields.io/badge/engine-LoomVTT%20%3E%3D0.1.0-781822?style=for-the-badge" alt="Loom Engine" /></a>
  <a href="https://github.com/sammore2/pf2e-loom"><img src="https://img.shields.io/badge/tests-107%20passing-2ea44f?style=for-the-badge" alt="Tests Status" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT%20%26%20ORC-blue?style=for-the-badge" alt="License" /></a>
  <a href="lang/"><img src="https://img.shields.io/badge/languages-PT--BR%20%7C%20EN-purple?style=for-the-badge" alt="Languages" /></a>
</p>

---

## ⚔️ Sobre o Projeto

O **PF2E** para **LoomVTT** é uma implementação nativa do sistema de regras *Pathfinder 2ª Edição (Remaster)*, desenvolvida para entregar máxima fidelidade às regras de mesa, velocidade de execução e uma experiência de usuário rica e imersiva.

Construído sob a arquitetura moderna de microsserviços e WebSockets do LoomVTT, o ruleset orquestra o pipeline estrito de cálculo de bônus do sistema, graus de sucesso de 4 estágios, economia de ações com glifos táteis, ciclo de vida de ferimentos e morte, além de integração completa de compêndios sob a licença aberta **ORC**.

---

## 🌟 Principais Recursos

### 🎯 1. Motor de Regras e Pipeline Estrito de Modificadores

- **Regras Canônicas de Stacking (Remaster)**: Filtra e consolida rigorosamente apenas o maior bônus e a pior penalidade por tipo (*status*, *circumstance*, *item*), acumulando modificadores não-tipados (*untyped*) de maneira estritamente legal.
- **Quatro Graus de Sucesso**: Avaliação automática contra a CD alvo (*Falha Crítica*, *Falha*, *Sucesso*, *Sucesso Crítico*), com ajuste dinâmico por 20 natural (+1 grau) e 1 natural (-1 grau).
- **Rolagens com Fortuna e Revés**: Suporte nativo a rolagens de *Fortune* e *Misfortune*.

### ⚔️ 2. Combate Tático e Economia de Ações

- **Strikes com MAP Automático**: Escada de ataque com penalidade de ataque múltiplo (*0 / -5 / -10* para armas padrão e *0 / -4 / -8* para armas ágeis).
- **Detecção de Traços de Armas**: Ajuste dinâmico de atributos (*Finesse*, *Agile*, *Deadly*, *Fatal*), dano elemental e dobro automático em acertos críticos.
- **Mitigação & Escudos**: Cálculo de imunidades, fraquezas, resistências e manobra de *Bloqueio com Escudo (Shield Block)* respeitando a Dureza (*Hardness*), PV do escudo e o Limiar de Quebra (*Broken Threshold*).
- **Controle de Morte & Sobrevivência**: Trilha completa de *Morrendo (Dying)*, *Ferido (Wounded)* e *Condenado (Doomed)* com testes planos de recuperação (*Recovery Flat Checks*) automatizados.

### 📜 3. Fichas de Jogo Dedicadas

| Ficha                                                | Descrição                                                                                                                                                                                                                                                            |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Personagem (`Pf2eCharacterSheet`)**        | Ergonomia em 720px, rail lateral contínuo de 175px, estética Paizo Remaster (Ardósia, Carmesim e Latão), barra de vida com**20 pips** táteis (5% por pip), trilhas de proficiência U/T/E/M/L de 4 pips, console de ações e cartões rápidos de Strikes. |
| **Ficha de Grupo (`Pf2ePartySheet`)**        | "Pasta viva" que agrega o grupo em tempo real: monitora PV, CA, Percepção passiva, Saves, atividades de exploração e tesouro compartilhado (PP, PO, PE, PC).                                                                                                       |
| **NPC & Criaturas (`Pf2eNpcSheet`)**         | Painel tático otimizado para o Mestre com rolagens imediatas e estatísticas diretas de qualquer nível de criatura (sem limites artificiais de 1-20).                                                                                                                |
| **Perigos & Armadilhas (`Pf2eHazardSheet`)** | Interface especializada para perigos simples e complexos com furtividade, CDs de neutralização e rotinas de ação.                                                                                                                                                  |
| **Familiares & Veículos**                     | Suporte a companheiros, familiares (`Pf2eFamiliarSheet`) e condução de veículos terrestres, aquáticos e aéreos (`Pf2eVehicleSheet`).                                                                                                                          |
| **Editor de Itens (`Pf2eItemSheet`)**        | Editor abrangente para armas, armaduras, equipamentos, magias, talentos e ações.                                                                                                                                                                                     |

### 📚 4. Navegador de Compêndios (Compendium Browser)

- Interface de busca rápida integrada em abas: **Ações**, **Equipamentos**, **Magias** e **Talentos**.
- Filtros em tempo real por nome, nível, traços e raridade.
- Suporte imediato a **Arrastar e Soltar (Drag & Drop)** direto para as fichas de personagens ou NPCs.
- Mais de **90 compêndios ORC** compactos e otimizados prontos para uso em campanhas.

### 🧙 5. Criador de Personagens & Evolução de Nível
- **Assistente de Criação em 7 Passos**: Ancestralidade, Herança, Antecedente, Classe, Atributos (+1 por aumento direto Remaster), Perícias e Talentos iniciais integrados aos compêndios ORC.
- **Subida de Nível (Level Up)**: Acúmulo de PV máximo, consumo de 1000 XP e cálculo de talentos e aumentos pendentes por classe.

### ✨ 6. Magia Completa & Potencialização (Heightening)
- **Potencialização Dinâmica**: Escalonamento por intervalo (`interval`) e ranks fixos (`fixed`), consumindo espaços de magia ou Pontos de Foco.
- **Cartões de Magia com Salvaguardas e Dano**: CD calculada, rolagem de resistências com 4 graus de sucesso (0x/0.5x/1x/2x) e dano com 1 clique.

### 🎲 7. Ferramentas do Mestre & Downtime
- **Calculadora de Encontros & Tesouro**: Avaliação automática de ameaça (*Trivial*, *Baixa*, *Moderada*, *Severa*, *Extrema*) e orçamentos proporcionais por jogador com tabela de tesouro do GM Core.
- **Atividades de Downtime**: Manufatura (*Crafting*) com cálculo de custo adiantado, dias extras e matérias-primas salvas; Obter Renda (*Earn Income*) por nível de tarefa e proficiência.

### ⏱️ 8. Integração com o Rastreador de Combate do LoomVTT

- **Iniciativa Direta**: Resposta automática ao hook `combatInitiative` do motor com o bônus de percepção ou perícia configurada do personagem.
- **Anúncio de Turno**: Publicação automática do orçamento de ações no início do turno (*3 Ações*, *Reação*, *Acelerado/Quickened*, *Atordoado/Stunned*).
- **Decréscimo Automático de Condições**: Condições com expiração no final do turno (como *Assustado / Frightened*) diminuem automaticamente com controle de autoridade do Mestre, prevenindo conflitos de concorrência.

### 🌐 6. Localização Completa (i18n)

- 🇧🇷 **Português do Brasil (`pt-BR`)**: Tradução canônica e fluida de termos do Remaster.
- 🇺🇸 **Inglês (`en`)**: Paridade completa de termos com os livros oficiais em inglês.

---

## 📥 Instalação

### Pelo LoomVTT Marketplace

1. No menu principal do seu mundo no LoomVTT, acesse **Configurações > Módulos & Rulesets**.
2. Procure por **PF2E** na aba de Marketplace.
3. Clique em **Instalar** e ative o ruleset nas configurações do seu mundo.

### Instalação via Manifesto (URL Direta)

No painel de instalação de rulesets do LoomVTT, insira a URL do manifesto oficial da versão mais recente:

```text
https://github.com/sammore2/pf2e-loom/releases/latest/download/ruleset.json
```

---

## 🛠️ Guia para Desenvolvedores

### Estrutura do Repositório

```text
pf2e/
├── assets/             # Fontes, estilos e arte de capa
├── lang/               # Dicionários de internacionalização (pt-BR.json, en.json)
├── packs/              # Pacotes JSON base de ações, equipamentos, magias e talentos
├── packs-orc/          # Compêndios SQLite com dados sob a licença ORC
├── scripts/            # Módulos de lógica de jogo, fichas e integração
│   ├── character-builder.mjs        # Lógica pura de criação e evolução de personagens
│   ├── character-builder-dialog.mjs # Diálogo assistente de criação em 7 passos
│   ├── character-sheet.mjs          # Ficha tática de personagem
│   ├── compendium-browser.mjs       # Navegador de compêndios ORC
│   ├── conditions.mjs               # Catálogo e transições de condições
│   ├── damage.mjs                   # Dano, cura, mitigação e testes de recuperação
│   ├── downtime.mjs                 # Obter Renda (Earn Income) e Manufatura (Crafting)
│   ├── encounter.mjs                # Calculadora de encontros e tesouro Remaster
│   ├── formula.mjs                  # Avaliador seguro de fórmulas matemáticas
│   ├── gm-tools-sheet.mjs           # Painel de ferramentas do Mestre
│   ├── modifiers.mjs                # Regras canônicas de empilhamento de bônus
│   ├── persistent-damage.mjs        # Dano persistente e testes planos de fim de turno
│   ├── predicate.mjs                # Avaliador puro de predicados booleanos
│   ├── prepare-data.mjs             # Pipeline de preparação de dados de atores
│   ├── progression-tables.mjs       # Tabelas de progressão por classe e nível
│   ├── roll-engine.mjs              # Motor de rolagens, salvaguardas e dano
│   ├── rule-elements.mjs            # Sistema de rule elements (FlatModifier, etc.)
│   └── spellcasting.mjs             # Gestão de slots, foco, preparação e potencialização
├── templates/          # Templates Handlebars (.hbs) das fichas e janelas
├── tests/              # Suíte completa de testes unitários automatizados
├── pf2e.mjs            # Ponto de entrada do ruleset no LoomVTT
└── ruleset.json        # Manifesto do pacote
```

### Executando Testes e Validação

O ruleset possui uma suíte com **107 testes unitários** com execução em milissegundos utilizando o test runner nativo do Node.js:

```bash
# Executar a suíte completa de testes
npm test

# Verificar integridade sintática dos scripts
npm run check
```

### API Global

O ruleset expõe uma API no escopo global acessível durante a sessão de jogo:

```javascript
// Abrir o navegador de compêndios programaticamente
window.PF2E.openCompendiumBrowser();

// Acessar utilitários de rolagem e modificadores
const { resolveModifiers, buildStrike } = window.PF2E;
```

---

## ⚖️ Licenças e Propriedade Intelectual

Este projeto adota um modelo transparente de licenciamento duplo:

- **Código-Fonte e Software**: Licenciado sob os termos da licença [MIT](LICENSE).
- **Conteúdo de Jogo e Mecânicas**: Licenciado sob a **ORC License** (Library of Congress TX 9-307-067). Consulte [`ORC-NOTICE.md`](ORC-NOTICE.md) para detalhes de atribuição.
- **Aviso Legal da Paizo Inc.**: *Pathfinder* é uma marca registrada de Paizo Inc. Este produto não é publicado, endossado ou especificamente aprovado pela Paizo Inc.
