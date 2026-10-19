import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
  server: {
    port: Number(process.env.PORT) || 5174,
    proxy: {
      // Same backend as V1 — Command's routes live in the same FastAPI
      // app (ARCHITECTURE.md Section 9, monolith-first), just a
      // different frontend origin.
      // Port 8420 developed some kind of persistent stale-socket state in
      // this environment (confirmed via Get-NetTCPConnection reporting an
      // owning PID that no process list corroborated) — moved to 9931 to
      // rule it out entirely rather than keep fighting it. 9931 then
      // developed the exact same symptom (Coverage Map plan Phase 10) —
      // moved to 9933, then 9935 (each recurred the same way — a phantom
      // LISTENING owner surviving repeated Stop-Process -Force, plus at
      // least one real orphaned uvicorn worker each time). Every
      // recurrence has coincided with uvicorn's --reload mode
      // specifically (WatchFiles spawns a reloader + worker process pair
      // per reload; on Windows this appears to leak a listening handle
      // across restarts rather than releasing it). Moved to 9937 AND
      // dropped --reload from how the backend is started — a single
      // long-lived worker with no reload dance has had none of this so
      // far. If 9937 recurs anyway, the port was never the variable.
      '/api': { target: 'http://localhost:9937', rewrite: p => p.replace(/^\/api/, '') },
    },
  },
})
