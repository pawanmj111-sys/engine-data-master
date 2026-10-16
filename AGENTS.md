<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->
- Desktop (Electron) builds use ELECTRON=1 to switch Vite to SPA mode without nitro; electron/main.cjs serves dist/client over an app:// protocol with _shell.html fallback — keeps absolute asset paths and client routing working offline.
