import './style.css';
import './pages/emulator';
import { renderExamples } from './pages/examples';
import { renderWiki } from './pages/wiki';
import { renderExercise, renderExerciseList } from './pages/exercises';
import { renderCheck } from './pages/check';

const emu = document.getElementById('view-emu')!;
const page = document.getElementById('view-page')!;
const links = document.querySelectorAll<HTMLAnchorElement>('.topnav a[data-route]');

function route() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const section = parts[0] ?? 'emulatore';
  const param = parts[1];

  links.forEach((a) => a.classList.toggle('on', a.dataset.route === section));
  const showEmu = section === 'emulatore' || !['esempi', 'wiki', 'esercizi', 'correzione'].includes(section);
  emu.hidden = !showEmu;
  document.body.classList.toggle('is-emu', showEmu);
  page.hidden = showEmu;
  if (showEmu) {
    document.title = 'Assembl-Easy · Emulatore 8086';
    return;
  }
  page.scrollTop = 0;
  switch (section) {
    case 'esempi':
      document.title = 'Esempi · Assembl-Easy';
      renderExamples(page, param);
      break;
    case 'wiki':
      document.title = 'Wiki istruzioni · Assembl-Easy';
      renderWiki(page, param);
      break;
    case 'esercizi':
      document.title = 'Esercizi · Assembl-Easy';
      if (param) renderExercise(page, param);
      else renderExerciseList(page);
      break;
    case 'correzione':
      document.title = 'Correzione · Assembl-Easy';
      renderCheck(page);
      break;
  }
}

window.addEventListener('hashchange', route);
route();
