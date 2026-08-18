// Folds the Vite build into one self-contained page for the Artifact publisher.
// The publisher supplies <!doctype>, <html>, <head> and <body>, so this emits
// page content only — title, fonts, styles, root node, and the inlined bundle.
import { readFileSync, writeFileSync } from 'node:fs';

const js = readFileSync('dist-artifact/bundle.js', 'utf8');
const css = readFileSync('dist-artifact/bundle.css', 'utf8');

// A literal </script> anywhere in the bundle would close the tag early.
const safeJs = js.replace(/<\/script/gi, '<\\/script');

const page = `<title>Mail Runner</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@500;600;700&family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&display=swap">
<style>
${css}
</style>
<div id="root"></div>
<script type="module">
${safeJs}
</script>
`;

writeFileSync('email-blast.artifact.html', page);

const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
console.log(`css    ${kb(css.length)}`);
console.log(`js     ${kb(js.length)}`);
console.log(`page   ${kb(page.length)}  -> email-blast.artifact.html`);
if (/<\/script/i.test(safeJs)) throw new Error('unescaped </script in bundle');
if (page.length > 16 * 1024 * 1024) throw new Error('page exceeds the 16MB artifact limit');
