# GitParcel

Bundle files from public GitHub folders and release assets from multiple repositories into one ZIP.
Paste a GitHub URL, select the files you want, and download the archive.

## Run locally

With Node.js 22 or later installed, run the following from the repository root. The app has no
package dependencies.

```sh
npm start
```

Open the local URL printed in the terminal. GitParcel builds ZIPs in the browser. The included Node
server streams public release assets when GitHub blocks a direct browser download.

## Build

Run `npm run build` to copy the frontend into `dist/`. Full release-asset support requires the
streaming endpoint in `scripts/serve.js`.

## Translations

English is the default. The language selector loads the chosen translation from `public/locales/`
and remembers the choice in the browser. All languages share the same layout.

To add a language, copy an existing JSON catalog, translate its values, and add the language to
the selector in `public/index.html`. Keep the English keys and placeholders such as `{count}`
and `{repo}` intact. Use the language button’s `lang` attribute as the catalog filename.

## License

GitParcel is released under [the Unlicense](LICENSE).
