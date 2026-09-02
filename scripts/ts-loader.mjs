// Resolve hook p/ rodar scripts que importam os módulos TS do app (que usam
// imports sem extensão, ex.: './phone'). Node v24 já faz type-stripping de .ts;
// só falta resolver o caminho. Uso: node --import ./scripts/ts-loader.mjs <script>
import { registerHooks } from 'node:module'
import { existsSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && !/\.[a-z0-9]+$/i.test(specifier)) {
      const base = fileURLToPath(new URL(specifier, context.parentURL))
      for (const ext of ['.ts', '.tsx', '.js', '.mjs', '/index.ts']) {
        if (existsSync(base + ext)) {
          return { url: pathToFileURL(base + ext).href, shortCircuit: true }
        }
      }
    }
    return nextResolve(specifier, context)
  },
})
