import { defineCloudflareConfig } from '@opennextjs/cloudflare'

// Configuração mínima: o painel não usa ISR nem cache incremental,
// então não precisa de R2/KV. Cada requisição roda no Worker.
export default defineCloudflareConfig()
