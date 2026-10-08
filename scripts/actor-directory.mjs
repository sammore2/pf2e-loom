/**
 * PF2E Actor Directory — Synchronizes Party actors into collapsible sidebar folders.
 * Parity pattern with WoD5e: party actors become folder-like containers nesting their members.
 */
const BaseDirectory = (typeof Loom !== 'undefined' && Loom?.applications?.sidebar?.tabs?.ActorDirectory)
  ? Loom.applications.sidebar.tabs.ActorDirectory
  : (typeof ActorDirectory !== 'undefined' ? ActorDirectory : class {});

export class Pf2eActorDirectory extends BaseDirectory {
  async _onRender(context, options) {
    if (super._onRender) {
      await super._onRender(context, options);
    }

    const html = this.element;
    if (!html) return;

    const directoryList = html.querySelector('.directory-list');
    if (!directoryList) return;

    // Retrieve all actors safely
    let actorList = [];
    if (typeof Loom !== 'undefined' && Loom?.actors) {
      actorList = Array.from(Loom.actors.values ? Loom.actors.values() : Loom.actors);
    } else if (typeof game !== 'undefined' && game?.actors) {
      actorList = Array.from(game.actors.values ? game.actors.values() : game.actors);
    }

    const partyActors = actorList.filter((a) => a.type === 'party');
    if (partyActors.length === 0) return;

    partyActors.forEach((party) => {
      const partyElement = html.querySelector(`[data-entry-id='${party.id}']`);
      if (!partyElement) return;

      const sd = party.systemData || party.system || {};
      const members = Array.isArray(sd.members) ? sd.members : [];

      // Avoid double-wrapping
      if (partyElement.classList.contains('pf2e-party-folder')) return;

      partyElement.classList.add('pf2e-party-folder', 'directory-item', 'group-item', 'flexcol', 'document');
      partyElement.setAttribute('data-uuid', `Actor.${party.id}`);

      // Clear flat name/thumbnail
      partyElement.querySelectorAll('.entry-name, .thumbnail').forEach((el) => el.remove());

      const isCollapsed = !!sd.collapsed;
      if (isCollapsed) partyElement.classList.add('collapsed');

      const headerHtml = `
        <header class="group-header party-header flexrow">
          <h3 class="noborder">
            <i class="fa-solid fa-folder-open fa-fw party-folder-icon"></i>
            <span class="party-name-text">${party.name || 'Grupo de Aventureiros'}</span>
          </h3>
          <a class="create-button open-party-sheet" data-id="${party.id}" title="Abrir Ficha do Grupo">
            <i class="fa-solid fa-users"></i>
          </a>
        </header>
        <ol class="subdirectory"></ol>
      `;

      partyElement.insertAdjacentHTML('beforeend', headerHtml);

      // Toggle collapse on folder header click
      partyElement.querySelector('.group-header')?.addEventListener('click', async (event) => {
        if (event.target.closest('.open-party-sheet')) return;
        event.preventDefault();
        partyElement.classList.toggle('collapsed');
        const nextCollapsed = partyElement.classList.contains('collapsed');
        if (party.update) {
          try {
            await party.update({ 'systemData.collapsed': nextCollapsed });
          } catch {
            // silent catch if not allowed
          }
        }
      });

      // Open party sheet button click
      partyElement.querySelector('.open-party-sheet')?.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        party.sheet?.render?.(true);
      });

      // Move each member's element inside this group subdirectory
      const subDir = partyElement.querySelector('.subdirectory');
      if (subDir && members.length > 0) {
        members.forEach((memberRef) => {
          const memberId = typeof memberRef === 'string' ? memberRef.replace(/^Actor\./, '') : memberRef?.id;
          if (!memberId) return;
          const memberEl = html.querySelector(`[data-entry-id='${memberId}']`);
          if (memberEl && memberEl !== partyElement) {
            subDir.appendChild(memberEl);
          }
        });
      }

      // Prepend party folder to the top of the directory list
      directoryList.prepend(partyElement);
    });
  }
}
