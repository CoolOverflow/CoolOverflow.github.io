// Minimal, dependency-free Markdown -> HTML renderer.
// Tuned for the blog's content: Chinese prose, fenced code, tables, block quotes,
// and LaTeX kept intact for client-side KaTeX rendering.

const CJK = /[\u2E80-\u9FFF\uF900-\uFAFF\u3000-\u303F\uFF00-\uFFEF]/;

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const PH_RE = /\u0000(\d+)\u0000/g;

function renderInline(raw) {
  const store = [];
  const stash = (html) => `\u0000${store.push(html) - 1}\u0000`;
  let s = raw;

  // inline code
  s = s.replace(/`([^`]+)`/g, (_, c) => stash(`<code>${esc(c)}</code>`));
  // inline math: keep delimiters, protect content from formatting
  s = s.replace(/(?<!\\)\$([^$\n]+?)\$/g, (m) => stash(m));

  s = esc(s);

  // images then links
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;([^&]*)&quot;)?\)/g, (_, alt, src, title) => {
    const t = title ? ` title="${title}"` : '';
    return `<img src="${src}" alt="${alt}" loading="lazy" decoding="async"${t}>`;
  });
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;([^&]*)&quot;)?\)/g, (_, text, href, title) => {
    const t = title ? ` title="${title}"` : '';
    const ext = /^https?:\/\//.test(href);
    const attrs = ext ? ' target="_blank" rel="noopener noreferrer"' : '';
    return `<a href="${href}"${attrs}${t}>${text}</a>`;
  });

  // emphasis
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
  s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>');

  return s.replace(PH_RE, (_, n) => store[Number(n)]);
}

function joinLines(lines) {
  let out = '';
  for (const line of lines) {
    if (!out) out = line;
    else if (CJK.test(out.slice(-1)) && CJK.test(line[0])) out += line;
    else out += ' ' + line;
  }
  return out.trim();
}

function isBlockStart(line) {
  return (
    /^\s*$/.test(line) ||
    /^\s*(```|~~~)/.test(line) ||
    /^\s*\$\$/.test(line) ||
    /^\s*#{1,6}\s+/.test(line) ||
    /^\s*>\s?/.test(line) ||
    /^\s*([-*+]|\d+[.)])\s+/.test(line) ||
    /^\s*([-*_])(\s*\1){2,}\s*$/.test(line) ||
    /^\s*\|/.test(line)
  );
}

function renderTable(rows) {
  const head = rows[0];
  const body = rows.slice(1);
  const th = head.map((c) => `<th>${renderInline(c.trim())}</th>`).join('');
  const trs = body
    .map((r) => `<tr>${r.map((c) => `<td>${renderInline(c.trim())}</td>`).join('')}</tr>`)
    .join('');
  return `<div class="table-wrap"><table><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table></div>`;
}

function renderList(node) {
  const tag = node.ordered ? 'ol' : 'ul';
  const items = node.items
    .map((it) => {
      let inner = renderInline(it.text);
      if (it.children.length) inner += it.children.map(renderList).join('');
      return `<li>${inner}</li>`;
    })
    .join('');
  return `<${tag}>${items}</${tag}>`;
}

function buildListTree(items) {
  const root = { indent: items[0].indent, ordered: items[0].ordered, items: [] };
  const stack = [root];
  let lastItem = null;
  for (const it of items) {
    while (stack.length > 1 && it.indent < stack[stack.length - 1].indent) stack.pop();
    let top = stack[stack.length - 1];
    if (it.indent > top.indent && lastItem && stack.length < 5) {
      const child = { indent: it.indent, ordered: it.ordered, items: [] };
      lastItem.children.push(child);
      stack.push(child);
      top = child;
    }
    const node = { text: it.text, children: [] };
    top.items.push(node);
    lastItem = node;
  }
  return root;
}

/**
 * @param {string} markdown
 * @param {{toc?: boolean}} opts
 * @returns {{html: string, toc: Array<{level:number,id:string,text:string}>}}
 */
export function mdToHtml(markdown, opts = {}) {
  const wantToc = opts.toc !== false;
  const src = String(markdown).replace(/\r\n?/g, '\n');
  const lines = src.split('\n');
  const out = [];
  const toc = [];
  let i = 0;
  let headingId = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (/^\s*$/.test(line)) {
      i++;
      continue;
    }

    // fenced code
    const fence = line.match(/^\s*(```|~~~)\s*([^\s`]*)\s*$/);
    if (fence) {
      const marker = fence[1];
      const lang = (fence[2] || '').toLowerCase();
      i++;
      const buf = [];
      while (i < lines.length && !new RegExp(`^\\s*${marker}\\s*$`).test(lines[i])) {
        buf.push(lines[i]);
        i++;
      }
      i++; // closing fence
      const langClass = lang ? ` class="language-${esc(lang)}"` : '';
      const label = lang ? `<span class="code-lang">${esc(lang)}</span>` : '';
      out.push(
        `<div class="code-block">${label}<pre><code${langClass}>${esc(buf.join('\n'))}</code></pre></div>`
      );
      continue;
    }

    // display math block
    if (/^\s*\$\$/.test(line)) {
      const buf = [line];
      const closedOnFirst = (line.match(/\$\$/g) || []).length >= 2;
      i++;
      if (!closedOnFirst) {
        while (i < lines.length) {
          buf.push(lines[i]);
          const isClose = /\$\$\s*$/.test(lines[i]);
          i++;
          if (isClose) break;
        }
      }
      out.push(`<div class="math math-display">${esc(buf.join('\n'))}</div>`);
      continue;
    }

    // horizontal rule
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      out.push('<hr>');
      i++;
      continue;
    }

    // heading
    const h = line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (h) {
      const level = h[1].length;
      const text = h[2];
      headingId += 1;
      const id = `h-${headingId}`;
      out.push(`<h${level} id="${id}">${renderInline(text)}</h${level}>`);
      if (wantToc && (level === 2 || level === 3)) {
        toc.push({ level, id, text: text.replace(/[*`$]/g, '') });
      }
      i++;
      continue;
    }

    // blockquote
    if (/^\s*>/.test(line)) {
      const buf = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) {
        buf.push(lines[i].replace(/^\s*>\s?/, ''));
        i++;
      }
      const inner = mdToHtml(buf.join('\n'), { toc: false });
      out.push(`<blockquote>${inner.html}</blockquote>`);
      continue;
    }

    // table
    if (/^\s*\|/.test(line) && /^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/.test(lines[i + 1] || '')) {
      const rows = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) {
        const cells = lines[i].trim().replace(/^\|/, '').replace(/\|$/, '').split('|');
        rows.push(cells);
        i++;
      }
      rows.splice(1, 1); // drop separator row
      out.push(renderTable(rows));
      continue;
    }

    // list
    if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) {
      const items = [];
      while (i < lines.length) {
        const m = lines[i].match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
        if (m) {
          items.push({ indent: m[1].length, ordered: /\d/.test(m[2]), text: m[3] });
          i++;
        } else if (items.length && /^\s{2,}\S/.test(lines[i])) {
          items[items.length - 1].text += '\n' + lines[i].trim();
          i++;
        } else break;
      }
      out.push(renderList(buildListTree(items)));
      continue;
    }

    // paragraph
    const para = [];
    while (i < lines.length && !isBlockStart(lines[i])) {
      para.push(lines[i]);
      i++;
    }
    if (para.length) out.push(`<p>${renderInline(joinLines(para))}</p>`);
    else i++;
  }

  return { html: out.join('\n'), toc };
}

export function splitFrontMatter(text) {
  const src = String(text).replace(/\r\n?/g, '\n');
  if (!src.startsWith('---')) return { data: {}, body: src };
  const end = src.indexOf('\n---', 3);
  if (end === -1) return { data: {}, body: src };
  const raw = src.slice(3, end).trim();
  const body = src.slice(end + 4).replace(/^\n+/, '');
  const data = {};
  for (const line of raw.split('\n')) {
    const m = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    let val = m[2].trim();
    if (val.startsWith('[') && val.endsWith(']')) {
      data[key] = val
        .slice(1, -1)
        .split(',')
        .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean);
    } else {
      data[key] = val.replace(/^['"]|['"]$/g, '');
    }
  }
  return { data, body };
}

export function readingTime(markdown) {
  const cjk = (markdown.match(/[\u4e00-\u9fff]/g) || []).length;
  const words = (markdown.replace(/[\u4e00-\u9fff]/g, ' ').match(/[A-Za-z0-9_.+#-]+/g) || []).length;
  return Math.max(1, Math.round(cjk / 320 + words / 220));
}
