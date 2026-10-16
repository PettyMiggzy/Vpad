// Small DOM helpers: the bottom sheet that holds nation / tile details, so every panel is real HTML (readable and tappable on a phone).
export function mountSheet(el) {
  let handlers = {};
  const api = {
    open(html, h = {}) {
      handlers = h;
      api.onOpen?.();
      el.innerHTML = `<div class="grab"></div>${html}`;
      requestAnimationFrame(() => el.classList.add('on'));
    },
    close() { el.classList.remove('on'); api.onClose?.(); },
  };
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if ('close' in b.dataset) api.close();
    else if ('go' in b.dataset && handlers.go) handlers.go();
    else for (const k of Object.keys(b.dataset)) if (handlers[k]) handlers[k](b);
  });
  return api;
}
