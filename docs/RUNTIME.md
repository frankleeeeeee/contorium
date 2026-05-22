# `@contora/runtime` (packages/runtime)



The extension depends on a **single** workspace package, **`@contora/runtime`**, for:



- **`RuntimeProvider`** — default implementation **`ContoraRuntime`** (`createRuntime()`).

- **BYOK prompt pairs** — `buildIntentPromptPair`, `buildSemanticSummaryPromptPair`, `buildCompressionPromptPair`.

- **Ranking hooks** — `RANKING_FACTORS`, `rankingScoreMultiplier`, `enrichPromptForProvider`, plus **`getContoraHooks()`** for a stable aggregate API.



The VS Code extension imports these through **`src/runtime/index.ts`**, which re-exports **`@contora/runtime`**.



---



## Layout



```text

packages/runtime/

├── package.json

├── tsconfig.json

└── src/

    ├── index.ts              # public exports

    ├── factory.ts            # createRuntime()

    ├── contoraHooks.ts       # bundled hook implementations

    ├── ContoraRuntime.ts     # RuntimeProvider

    ├── promptBuilders.ts

    ├── promptTypes.ts

    ├── rankingFactors.ts

    └── core/interfaces.ts

```



---



## Scripts



| Script | Command | Purpose |

|--------|---------|---------|

| `build:runtime` | `npm --prefix packages/runtime run build` | `tsc` → `dist/`. |



Root **`vscode:prepublish`** runs **`npm run compile`**, which builds the runtime package then compiles the extension host (`tsc -p ./`).



---



## Historical note



Earlier revisions used multiple runtime packages or release-only obfuscation steps. The tree is now **one** **`@contora/runtime`** package with a plain TypeScript build.

