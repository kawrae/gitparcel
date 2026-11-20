# GitParcel

GitParcel is an open-source tool for downloading a single folder from a public GitHub repository
or combining folders and release assets from several repositories into one ZIP. It runs in your
browser and uses plain JavaScript.

## Create a bundle

1. Choose **Repo folder** and paste a repository or subfolder URL, or choose **Release assets**
   and paste a release or asset link. Select **Add source**. You can repeat this step to mix
   sources in the same archive.
2. In **Bundle contents**, filter by filename or repository and select the files you want.
3. In **Export settings**, name the ZIP and choose whether to keep folder paths or include a
   `manifest.json` recording each file’s source and revision. Choose **Store** to keep the files
   uncompressed or **Deflate** to compress them, then select **Download ZIP**.

GitParcel fetches up to six files at once and assembles the ZIP in browser memory. Each bundle
can contain up to 512 MiB of selected files before compression.

Adding one source uses at most 24 GitHub API requests, 8 MiB of decoded JSON, and 10,000 metadata
entries. The queue holds up to 65,535 files and 32 MiB of estimated text metadata. If a source is
too large, choose a smaller folder or release. If a link matches multiple revisions, open the
intended folder on GitHub, press `y`, and paste the permalink containing the full commit SHA.

GitParcel verifies release downloads against GitHub's SHA-256 digest when one is available.
This requires HTTPS or localhost. Release entries in the optional manifest include the GitHub
asset ID and the digest. Older assets without a published digest have `"digest": null` and
still receive a byte-length check.

## Run locally

With Node.js 22 or later installed, run the following from the repository root.

```sh
npm start
```

Open the local URL printed in the terminal. GitParcel builds ZIPs in the browser. The included Node
server streams public release assets when GitHub blocks a direct browser download.

The proxy allows six simultaneous transfers and 60 transfer starts per rolling hour per server
process. Each transfer is limited to 512 MiB and ten minutes, including streaming time. To lower
these limits, set a positive integer in the corresponding environment variable.

| Environment variable | Default |
| --- | ---: |
| `GITPARCEL_ASSET_CONCURRENCY` | 6 |
| `GITPARCEL_ASSET_REQUESTS_PER_HOUR` | 60 |
| `GITPARCEL_ASSET_MAX_BYTES` | 536870912 |
| `GITPARCEL_ASSET_TIMEOUT_MS` | 600000 |

## Build

Run `npm run build` to replace `dist/` with a fresh copy of the frontend. Full release-asset
support requires the streaming endpoint in `scripts/serve.js`.

## Translations

English is the default. Use the globe button next to **Guide** to switch to French, Spanish,
German, Polish, Ukrainian, Brazilian Portuguese, Japanese, or Simplified Chinese. GitParcel
loads the chosen translation from `public/locales/` and remembers the choice in the browser.
The available locales include Palestinian Arabic.

To add a language, copy an existing JSON catalog, translate its values, and add the language to
the selector in `public/index.html`. Keep the English keys and placeholders such as `{count}`
and `{repo}` intact. Match the filename to the button’s `lang` attribute, for example
`pt-BR.json` for `lang="pt-BR"`.

## License

GitParcel is released under [the Unlicense](LICENSE).
The bundled IBM Plex Sans font is served locally and distributed under the [SIL Open Font License](public/fonts/OFL.txt).
