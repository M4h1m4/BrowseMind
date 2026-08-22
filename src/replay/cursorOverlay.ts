import type { Page } from 'playwright'

const CURSOR_JS = `
(function() {
  if (document.getElementById('__bm_cursor__')) return;

  const cursor = document.createElement('div');
  cursor.id = '__bm_cursor__';
  cursor.style.cssText = \`
    position: fixed;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: rgba(99, 102, 241, 0.85);
    border: 3px solid white;
    box-shadow: 0 0 0 2px rgba(99,102,241,0.5), 0 4px 12px rgba(0,0,0,0.3);
    pointer-events: none;
    z-index: 2147483647;
    transform: translate(-50%, -50%);
    transition: left 0.25s cubic-bezier(0.4,0,0.2,1), top 0.25s cubic-bezier(0.4,0,0.2,1);
    left: -100px;
    top: -100px;
  \`;

  const label = document.createElement('div');
  label.id = '__bm_label__';
  label.style.cssText = \`
    position: fixed;
    background: rgba(30,30,40,0.92);
    color: #fff;
    font: 600 12px/1.4 system-ui, sans-serif;
    padding: 4px 10px;
    border-radius: 6px;
    pointer-events: none;
    z-index: 2147483647;
    max-width: 260px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    box-shadow: 0 2px 8px rgba(0,0,0,0.35);
    display: none;
    transform: translate(-50%, 0);
    margin-top: 18px;
  \`;

  document.documentElement.appendChild(cursor);
  document.documentElement.appendChild(label);
})();
`

const MOVE_JS = (x: number, y: number, text: string) => `
(function() {
  const c = document.getElementById('__bm_cursor__');
  const l = document.getElementById('__bm_label__');
  if (!c || !l) return;
  c.style.left = '${x}px';
  c.style.top  = '${y}px';
  if (${JSON.stringify(text)}) {
    l.textContent = ${JSON.stringify(text)};
    l.style.left  = '${x}px';
    l.style.top   = '${y}px';
    l.style.marginTop = '18px';
    l.style.display = 'block';
  } else {
    l.style.display = 'none';
  }
})();
`

const CLICK_JS = (x: number, y: number) => `
(function() {
  const ripple = document.createElement('div');
  ripple.style.cssText = \`
    position: fixed;
    left: ${x}px;
    top: ${y}px;
    width: 0;
    height: 0;
    border-radius: 50%;
    background: rgba(99,102,241,0.45);
    pointer-events: none;
    z-index: 2147483646;
    transform: translate(-50%,-50%);
    animation: __bm_ripple__ 0.5s ease-out forwards;
  \`;
  if (!document.getElementById('__bm_style__')) {
    const s = document.createElement('style');
    s.id = '__bm_style__';
    s.textContent = '@keyframes __bm_ripple__ { to { width: 80px; height: 80px; opacity: 0; } }';
    document.head.appendChild(s);
  }
  document.documentElement.appendChild(ripple);
  setTimeout(() => ripple.remove(), 550);
})();
`

export async function injectCursor(page: Page): Promise<void> {
  try {
    await page.evaluate(CURSOR_JS)
  } catch {
    // page may have navigated; not fatal
  }
}

export async function moveCursor(page: Page, x: number, y: number, label = ''): Promise<void> {
  try {
    await page.evaluate(MOVE_JS(x, y, label))
  } catch { /* not fatal */ }
}

export async function clickAnimation(page: Page, x: number, y: number): Promise<void> {
  try {
    await page.evaluate(CLICK_JS(x, y))
  } catch { /* not fatal */ }
}
