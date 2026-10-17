# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Each release tag `vX.Y.Z` automatically publishes the section headed `## [X.Y.Z]` as its GitHub release notes.

---

## [Unreleased]

---

## [0.1.0] - 2026-10-12

### Added
- **Core Rules Engine & Data Pipeline**:
  - Implemented strict Pathfinder 2e Remaster modifier stacking rules (`scripts/modifiers.mjs`): highest bonus and worst penalty per typed category (*status*, *circumstance*, *item*); untyped modifiers stack additively.
  - Idempotent actor data preparation pipeline (`scripts/prepare-data.mjs`) supporting PC, NPC, Hazard, Group, Familiar, and Vehicle actors with non-destructive cloning and WebSocket re-render safety.
  - Automatic calculation of Base AC, Dex Caps, Skill Proficiencies, Saving Throws, Class DC, Spell Attack/DC, Speed, and Perception.
  - Four degrees of success calculation (*Critical Success*, *Success*, *Failure*, *Critical Failure*) with natural 20 (+1 tier) and natural 1 (-1 tier) adjustments, plus Fortune and Misfortune roll support.
- **Strikes, Multiple Attack Penalty (MAP) & Mitigations**:
  - Unified attack pipeline (`scripts/checks.mjs`): automatic calculation of MAP steps (0 / -5 / -10 for standard weapons; 0 / -4 / -8 for agile weapons).
  - Weapon trait recognition (Finesse, Agile, Reach, Thrown, Deadly, Fatal) with dynamic attribute selection (DEX vs STR).
  - Damage calculation engine (`scripts/damage.mjs`): full support for weaknesses, resistances, immunities, and critical damage doubling.
  - Temporary HP prioritization and *Shield Block* mitigation mechanics respecting Shield Hardness, HP, and the *Broken Threshold*.
- **Death & Dying Life Cycle**:
  - Full Remaster dying track: transitions across *Dying*, *Wounded*, and *Doomed* states.
  - Automated Recovery Flat Checks (DC 10 + current dying value) and damage while dying (incorporating Wounded increase).
  - Heroic Recovery and Hero Point management.
- **Conditions & Action Economy**:
  - Complete Remaster status condition catalog (`scripts/conditions.mjs`): selective penalties (e.g. Clumsy, Enfeebled, Stupefied) and flat checks (Concealed DC 5, Hidden DC 11).
  - Action budget calculator (*Quickened*, *Slowed*, *Stunned*, *Unconscious* action consumption).
  - Automatic end-of-turn condition decrement (e.g., *Frightened* losing 1 value per turn) tied to the LoomVTT combat tracker with GM authority.
- **Spellcasting & Progression**:
  - Prepared and Spontaneous spellcasting slots by rank (`scripts/spellcasting.mjs`).
  - Cantrips (slot-free auto-scaling) and Focus Spells with focus point tracking and *Refocus* limits.
  - Rest & Daily Preparation workflows.
  - Bulk & Encumbrance calculator (`scripts/actions.mjs`) featuring Light bulk conversion (10 L = 1 Bulk), encumbered threshold (5 + STR mod), maximum capacity (10 + STR mod), and circular container loop prevention.
- **Remaster Tabletop Sheets**:
  - **Character Sheet (`Pf2eCharacterSheet`)**: 720px ergonomic layout with 175px persistent rail, Paizo Remaster Slate & Crimson aesthetic, 20-pip visual HP track, 4-pip proficiency indicator (`U / T / E / M / L`), action economy console (`◆`, `↺`), and weapon cards with multi-attack buttons.
  - **Party Sheet (`Pf2ePartySheet`)**: Live group overview monitoring member health, armor class, passive perception, exploration activities, and pooled party currency.
  - **NPC Sheet (`Pf2eNpcSheet`)**: Streamlined combat dashboard for creatures and adversaries with direct un-clamped statistics and action triggers.
  - **Hazard Sheet (`Pf2eHazardSheet`)**: Dedicated interface for complex traps and environmental hazards with stealth, disablement DCs, and routine actions.
  - **Familiar & Vehicle Sheets (`Pf2eFamiliarSheet`, `Pf2eVehicleSheet`)**: Specialized sheets for companions and land/water/air vehicles.
  - **Item Sheet (`Pf2eItemSheet`)**: Universal item editor for weapons, armor, equipment, feats, actions, and spells.
- **Compendium Browser (`Pf2eCompendiumBrowser`)**:
  - Built-in searchable browser for actions, equipment, spells, and feats with live filtering and drag-and-drop support.
  - Shipped with clean ORC-licensed compendium packs in `packs-orc/` (96 SQLite databases) and standard packs in `packs/`.
- **Combat Tracker & Chat Integration**:
  - Automated PF2e initiative bonus answering Loom's `combatInitiative` hook (`scripts/combat-initiative.mjs`).
  - Chat card wrapper (`scripts/chat-card.mjs`) intercepting and beautifully styling d20 rolls, strikes, and damage cards.
  - Turn start announcement posting the current combatant's action budget to the game chat.
- **Internationalization (i18n)**:
  - Full bilingual support in Brazilian Portuguese (`pt-BR`) and English (`en`).
- **Developer API & Test Suite**:
  - Public developer API exposed under `window.PF2E` (`scripts/api.mjs`).
  - 107 automated unit tests covering all core mechanics and UI schemas.
