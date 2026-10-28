(() => {
  const API = 'https://video-downloader-api.rizu.blitz.cloud';
  const init = () => {
    const input = document.querySelector('#url');
    const mainButton = document.querySelector('.go');
    const pasteButton = document.querySelector('.paste');
    const note = document.querySelector('.note');
    const results = document.querySelector('.res');
    if (!input || !mainButton || !results || mainButton.dataset.apiBound) return;
    mainButton.dataset.apiBound = '1';

    const status = (message, error = false) => {
      if (note) {
        note.textContent = message;
        note.style.color = error ? '#dc2626' : '';
        note.setAttribute('role', 'status');
        note.setAttribute('aria-live', 'polite');
      }
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
    async function download(url, formatId, button) {
      const old = button.textContent;
      button.disabled = true;
      button.textContent = 'Preparing…';
      status('Preparing download…');
      try {
        const response = await fetch(API + '/api/download?format_id=' + encodeURIComponent(formatId || 'best'), {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({url})
        });
        if (!response.ok) throw new Error(await errorText(response));
        const blob = await response.blob();
        const disposition = response.headers.get('Content-Disposition') || '';
        const match = disposition.match(/filename="?([^";]+)"?/i);
        const a = document.createElement('a');
        const objectUrl = URL.createObjectURL(blob);
        a.href = objectUrl;
        a.download = match ? match[1] : 'video-download';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
        status('Download started. Check your Downloads folder.');
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
      catch (_) { status('Paste a valid http or https video URL first.', true); return; }
      mainButton.disabled = true;
      status('Checking video link…');
      try {
        const response = await fetch(API + '/api/info', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({url})
        });
        if (!response.ok) throw new Error(await errorText(response));
        const info = await response.json();
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
        panel.appendChild(el('div', 'rt', info.title || 'Video ready'));
        const formats = (info.formats || []).filter(f => f.format_id && f.has_audio && ['mp4','webm'].includes(f.ext));
        const seen = new Set();
        const choices = formats.filter(f => {
          const key = (f.height || 0) + ':' + f.ext;
          if (seen.has(key)) return false;
          seen.add(key); return true;
        }).sort((a,b) => (b.height || 0) - (a.height || 0)).slice(0,8);
        (choices.length ? choices : [{format_id:'best', ext:'mp4'}]).forEach(f => {
          const row = el('div', 'row');
          const quality = f.height ? f.height + 'p' : 'Best available';
          const label = el('span', '', (f.ext || 'video').toUpperCase() + ' · ' + quality);
          const button = el('button', '', 'Download');
          button.type = 'button';
          button.addEventListener('click', () => download(url, f.format_id, button));
          row.append(label, button);
          panel.appendChild(row);
        });
        results.append(thumb, panel);
        status('Video found. Choose a format to download. Only download content you have permission to save.');
      } catch (e) {
        status('Could not load video: ' + (e.message || 'network error'), true);
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