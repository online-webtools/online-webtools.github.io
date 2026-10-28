(() => {
  const API = 'https://video-downloader-api.rizu.blitz.cloud';
  const init = () => {
    const input = document.querySelector('#url');
    const mainButton = document.querySelector('.go');
    const pasteButton = document.querySelector('.paste');
    const note = document.querySelector('.note');
    const results = document.querySelector('.res');
    const chips = document.querySelector('.chips');
    if (!document.getElementById('media-mode-chip-styles')) {
      const style = document.createElement('style');
      style.id = 'media-mode-chip-styles';
      style.textContent = '.chips .chip{cursor:pointer;transition:background .15s,color .15s,border-color .15s}.chips .chip.active{background:#42dc83!important;color:#07120b!important;border-color:#42dc83!important}.chips .chip:focus-visible{outline:2px solid #42dc83;outline-offset:3px}.chips button.chip{font:inherit}';
      document.head.appendChild(style);
    }
    if (!input || !mainButton || !results || mainButton.dataset.apiBound) return;
    mainButton.dataset.apiBound = '1';

    let mode = 'video';
    let preferredHeight = 0;
    let currentTitle = 'video-download';

    if (!document.getElementById('downloader-responsive-styles')) {
      const responsive = document.createElement('style');
      responsive.id = 'downloader-responsive-styles';
      responsive.textContent = `
        *, *::before, *::after { box-sizing: border-box; }
        html, body { max-width: 100%; overflow-x: hidden; }
        .pg { width: 100%; min-height: 100vh; overflow-x: clip; }
        .pg main, .pg section, .pg .hero, .pg .wrap { max-width: 100%; }
        .fld, .urlbar, .input-wrap { min-width: 0; }
        .fld input, #url { width: 100%; min-width: 0; }
        .go, .paste { flex-shrink: 0; }
        .res { width: min(760px, calc(100% - 32px)); min-width: 0; }
        .rl, .row, .rt { min-width: 0; overflow-wrap: anywhere; }
        .row { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
        .row button { flex-shrink: 0; }
        .chips { padding-inline: 12px; }
        @media (max-width: 600px) {
          .pg { padding-inline: 16px !important; }
          .hero { padding-inline: 0 !important; }
          h1 { font-size: clamp(30px, 8vw, 40px) !important; line-height: 1.12 !important; overflow-wrap: anywhere; }
          .fld { display: flex; flex-wrap: wrap; gap: 8px; padding: 10px !important; }
          .fld input, #url { flex: 1 1 100%; width: 100%; font-size: 16px !important; }
          .paste { flex: 1 1 30%; min-height: 44px; }
          .go { flex: 1 1 60%; min-height: 48px !important; padding-inline: 16px !important; font-size: 16px !important; }
          .chips { gap: 8px !important; }
          .chips .chip { padding: 10px 14px !important; font-size: 14px !important; }
          .res { width: 100%; padding: 14px !important; gap: 14px !important; }
          .row button { max-width: 100%; }
        }
      `;
      document.head.appendChild(responsive);
    }

    const status = (message, error = false) => {
      if (!note) return;
      note.textContent = message;
      note.style.color = error ? '#dc2626' : '';
      note.setAttribute('role', 'status');
      note.setAttribute('aria-live', 'polite');
    };
    const el = (tag, cls, text) => {
      const node = document.createElement(tag);
      if (cls) node.className = cls;
      if (text !== undefined) node.textContent = text;
      return node;
    };
    const errorText = async response => {
      try {
        const data = await response.json();
        return data.detail || 'Request failed (' + response.status + ')';
      } catch (_) {
        return 'Request failed (' + response.status + ')';
      }
    };
    const setMode = (nextMode, height = 0) => {
      mode = nextMode;
      preferredHeight = height;
      if (!chips) return;
      chips.querySelectorAll('[data-download-mode]').forEach(chip => {
        const active = chip.dataset.downloadMode === mode &&
          (mode !== 'video' || Number(chip.dataset.height || 0) === preferredHeight);
        chip.classList.toggle('active', active);
        chip.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
      if (mode === 'audio') status('Audio mode selected. We will offer MP3 when the source audio can be converted.');
      else if (mode === 'image') status('Image mode selected. Available images depend on the source post.');
      else status('Video mode selected. Available qualities depend on the source.');
    };
    if (chips) {
      const imageChip = el('button', 'chip', 'Images');
      imageChip.type = 'button';
      imageChip.dataset.downloadMode = 'image';
      chips.appendChild(imageChip);
      chips.querySelectorAll('.chip').forEach(chip => {
        const label = chip.textContent.trim().toLowerCase();
        if (label === 'mp4') chip.dataset.downloadMode = 'video';
        else if (label === 'mp3') chip.dataset.downloadMode = 'audio';
        else if (label === 'hd 1080p') { chip.dataset.downloadMode = 'video'; chip.dataset.height = '1080'; }
        else if (label === '4k') { chip.dataset.downloadMode = 'video'; chip.dataset.height = '2160'; }
        else return;
        chip.setAttribute('role', 'button');
        chip.setAttribute('tabindex', '0');
        chip.setAttribute('aria-pressed', 'false');
        const activate = () => setMode(chip.dataset.downloadMode, Number(chip.dataset.height || 0));
        chip.addEventListener('click', activate);
        chip.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); } });
      });
      imageChip.setAttribute('aria-pressed', 'false');
      imageChip.addEventListener('click', () => setMode('image'));
      setMode('video');
    }
    async function download(url, formatId, button, downloadMode = mode) {
      const old = button.textContent;
      button.disabled = true;
      button.textContent = 'Preparing…';
      status('Preparing your ' + (downloadMode === 'audio' ? 'MP3' : downloadMode === 'image' ? 'image' : 'video') + '…');
      try {
        const query = new URLSearchParams({format_id: formatId || 'best', mode: downloadMode});
        const response = await fetch(API + '/api/download?' + query.toString(), {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({url})
        });
        if (!response.ok) throw new Error(await errorText(response));
        const blob = await response.blob();
        const disposition = response.headers.get('Content-Disposition') || '';
        let filename = '';
        const utf8 = disposition.match(/filename\*=UTF-8''([^;]+)/i);
        const plain = disposition.match(/filename="?([^";]+)"?/i);
        if (utf8) { try { filename = decodeURIComponent(utf8[1]); } catch (_) { filename = utf8[1]; } }
        else if (plain) filename = plain[1];
        const fallbackExt = downloadMode === 'audio' ? '.mp3' : downloadMode === 'image' ? '' : '.mp4';
        const safeTitle = (currentTitle || 'video-download')
          .replace(/[\\/:*?\"<>|]/g, '')
          .replace(/[. ]+$/g, '')
          .trim()
          .slice(0, 180) || (downloadMode === 'audio' ? 'audio-download' : downloadMode === 'image' ? 'image-download' : 'video-download');
        if (!filename || /^(video-download|audio-download|image-download)(\\.[a-z0-9]{2,5})?$/i.test(filename)) {
          filename = safeTitle + fallbackExt;
        } else if (!/\\.[a-z0-9]{2,5}$/i.test(filename) && fallbackExt) {
          filename += fallbackExt;
        }
        const objectUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = objectUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
        status('Download complete or started. Check your Downloads folder.');
      } catch (e) {
        status('Download failed: ' + (e.message || 'network error'), true);
      } finally {
        button.disabled = false;
        button.textContent = old;
      }
    }
    async function inspect() {
      const url = input.value.trim();
      try { const parsed = new URL(url); if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error(); }
      catch (_) { status('Paste a valid http or https media URL first.', true); return; }
      mainButton.disabled = true;
      status('Checking link…');
      try {
        const response = await fetch(API + '/api/info', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({url})
        });
        if (!response.ok) throw new Error(await errorText(response));
        const info = await response.json();
        currentTitle = (info.title || 'video-download').trim();
        results.replaceChildren();
        const thumb = el('div', 'th');
        if (info.thumbnail && /^https:\/\//i.test(info.thumbnail)) {
          const img = el('img');
          img.src = info.thumbnail;
          img.alt = '';
          img.loading = 'lazy';
          img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:14px';
          thumb.appendChild(img);
        } else thumb.textContent = '▶';
        const panel = el('div', 'rl');
        panel.appendChild(el('div', 'rt', info.title || 'Media ready'));

        if (mode === 'audio') {
          const row = el('div', 'row');
          row.append(el('span', '', 'MP3 · 192 kbps'));
          const button = el('button', '', 'Download MP3');
          button.type = 'button';
          button.addEventListener('click', () => download(url, 'bestaudio/best', button, 'audio'));
          row.appendChild(button);
          panel.appendChild(row);
          results.append(thumb, panel);
          status('Audio found. Choose Download MP3 if the source audio is accessible.');
          return;
        }
        if (mode === 'image') {
          const row = el('div', 'row');
          row.append(el('span', '', 'Image · Original available format'));
          const button = el('button', '', 'Download image');
          button.type = 'button';
          button.addEventListener('click', () => download(url, 'best', button, 'image'));
          row.appendChild(button);
          panel.appendChild(row);
          results.append(thumb, panel);
          status('Image mode ready. The source must expose downloadable image media.');
          return;
        }

        const formats = (info.formats || []).filter(f => f.format_id && f.has_audio && ['mp4','webm'].includes(f.ext));
        const seen = new Set();
        let choices = formats.filter(f => {
          const key = (f.height || 0) + ':' + f.ext;
          if (seen.has(key)) return false;
          seen.add(key); return true;
        }).sort((a,b) => (b.height || 0) - (a.height || 0)).slice(0,8);
        if (preferredHeight) {
          const exact = choices.filter(f => (f.height || 0) >= preferredHeight);
          if (exact.length) choices = exact.slice(0,3);
          else status('Requested quality is not available. Showing available qualities instead.');
        }
        (choices.length ? choices : [{format_id:'best', ext:'mp4'}]).forEach(f => {
          const row = el('div', 'row');
          const quality = f.height ? f.height + 'p' : 'Best available';
          const label = el('span', '', (f.ext || 'video').toUpperCase() + ' · ' + quality);
          const button = el('button', '', 'Download');
          button.type = 'button';
          button.addEventListener('click', () => download(url, f.format_id, button, 'video'));
          row.append(label, button);
          panel.appendChild(row);
        });
        results.append(thumb, panel);
        status('Video found. Choose an available quality. Only download content you have permission to save.');
      } catch (e) {
        status('Could not load media: ' + (e.message || 'network error'), true);
      } finally {
        mainButton.disabled = false;
      }
    }
    mainButton.addEventListener('click', inspect);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); inspect(); } });
    if (pasteButton) pasteButton.addEventListener('click', async () => {
      try { input.value = await navigator.clipboard.readText(); input.focus(); status('Link pasted. Press Download to check it.'); }
      catch (_) { status('Clipboard access blocked. Paste the link manually.', true); input.focus(); }
    });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
})();
