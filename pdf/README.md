# PDF Text Editor (web version)

Edit existing text in a PDF while keeping the original font, size, color and position.
Runs entirely in your browser: the PDF is never uploaded anywhere. Works as a static
site, so it can be hosted free on GitHub Pages.

## Use

1. Open the site and click **Open PDF** (or drag a PDF onto the page).
2. Click any text and type the new text.
3. Press **Enter** to apply, **Esc** to cancel, **Tab** for the next line.
4. **Undo** (Cmd/Ctrl+Z), **Revert** per edit and **Find** are available.
5. Click **Download PDF** to save `<name>_edited.pdf`.

The side panel tells you live whether every character exists in the PDF's own font.

### Letters the PDF never contained

PDFs usually include only the letters they use. If you type a new one:

- **Chrome / Edge:** click **Use my installed fonts** once and allow the prompt. The
  letter is then drawn with the same font from your computer when it is installed.
- **Safari / Firefox:** the closest built-in font is used (Helvetica, Times or Courier style).

Either way the editor warns you. Edits that only use letters already in the PDF match exactly.

## Publish on GitHub Pages

1. Create a new repository on github.com (for example `pdf-editor`). Public is fine:
   the site contains only the tool, never anyone's documents.
2. Upload the contents of this folder. From Terminal:

       cd ~/Desktop/pdf-editor-web
       git init -b main
       git add .
       git commit -m "PDF text editor"
       git remote add origin https://github.com/<your-username>/pdf-editor.git
       git push -u origin main

   (Or use **Add file > Upload files** on github.com and drag everything in, including `lib/`.)
3. In the repository: **Settings > Pages > Build and deployment > Source: Deploy from a branch**,
   branch `main`, folder `/ (root)`, **Save**.
4. After about a minute the site is live at `https://<your-username>.github.io/pdf-editor/`.
   Share that link.

To update later: change files, then `git add . && git commit -m "update" && git push`.

## Test locally

A static file server is enough (opening `index.html` directly from disk will not work,
browsers block WebAssembly modules on `file://`):

    cd ~/Desktop/pdf-editor-web
    python3 -m http.server 8770 --bind 127.0.0.1

Open http://127.0.0.1:8770 and stop with Ctrl+C.

Headless engine test (Node 18+ or Bun):

    node tests/test-engine.mjs samples/invoice.pdf /tmp/out.pdf '{"$40.00":"$48.00"}'

## Files

| File | Purpose |
|---|---|
| `index.html` | Editor page |
| `app.js` | Page logic |
| `engine.js` | PDF text replacement (runs in the browser) |
| `fontsource.js` | Installed-font lookup (Chrome/Edge), including .ttc collections |
| `lib/` | MuPDF.js 1.28.1 (WebAssembly PDF library) |
| `samples/` | Made-up test PDFs. Never commit real documents. |
| `tests/` | Headless engine test |
| `.nojekyll` | Tells GitHub Pages to serve files as-is |

## Limits

- Text does not reflow: keep replacements about the original length.
- Scanned PDFs (pictures of text) have no editable text.
- Very large PDFs are limited by browser memory.

## License

AGPL-3.0, because it is built on MuPDF.js (AGPL-3.0, https://mupdf.com). Keeping the
source public in the repository satisfies this.
